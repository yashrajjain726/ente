import { expose } from "comlink";
import path from "node:path";
import { z } from "zod";
import log from "../log-worker";
import { messagePortMainEndpoint } from "../utils/comlink";
import { wait } from "../utils/common";
import { fsStatMtime } from "./fs";

// require(paths.addon) loads this module; the import supplies only its types.
import type * as MLNativeModule from "../../../rust-bindings";
import type { MLNativePaths } from "./ml-native";

log.debugString("Started ML utility process");

process.on("uncaughtException", (e, origin) => log.error(origin, e));

process.parentPort.once("message", (e) => {
    const { mlNativePaths } = parseInitData(e.data);
    loadMLNative(mlNativePaths);
    if (_native) void warmUpClipTextEncoder(_native);

    expose(
        {
            fsStatMtime,
            analyzeImage,
            releaseMLRuntime,
            computeCLIPTextEmbeddingIfAvailable,
        },
        messagePortMainEndpoint(e.ports[0]!),
    );
});

let _userDataPath: string | undefined;

const userDataPath = () => _userDataPath!;

const MLWorkerInitData = z.object({
    userDataPath: z.string(),
    mlNativePaths: z.object({
        addon: z.string(),
        onnxRuntimeLibrary: z.string(),
    }),
});

const parseInitData = (data: unknown) => {
    const initData = MLWorkerInitData.parse(data);
    _userDataPath = initData.userDataPath;
    return initData;
};

type MLNative = typeof MLNativeModule;

type MLWorkerAnalyzeImageErrorKind = "init" | "ort" | "image" | "misc";

interface MLWorkerAnalyzeImageError {
    kind: MLWorkerAnalyzeImageErrorKind;
    message: string;
}

type MLWorkerAnalyzeImageResponse =
    | { ok: true; result: MLNativeModule.AnalyzeImageResult }
    | { ok: false; error: MLWorkerAnalyzeImageError };

class CategorizedMLWorkerError extends Error {
    constructor(
        public readonly kind: MLWorkerAnalyzeImageErrorKind,
        message: string,
    ) {
        super(message);
        this.name = "CategorizedMLWorkerError";
    }
}

let _native: MLNative | undefined;
let _assetStore: MLNativeModule.AssetStore | undefined;
let _nativeLoadError: string | undefined;

const loadMLNative = (paths: MLNativePaths) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const native = require(paths.addon) as MLNative;
        native.initOrt(paths.onnxRuntimeLibrary);
        // Enables WebGPU where supported; macOS continues to use CoreML.
        native.setMlExecutionConfig(true);
        _assetStore = new native.AssetStore(
            path.join(userDataPath(), "assets"),
            path.join(userDataPath(), "models"),
        );
        _native = native;
    } catch (e) {
        _nativeLoadError = e instanceof Error ? e.message : String(e);
        log.error(`Failed to load ML addon at ${paths.addon}`, e);
    }
};

const mlNative = () => {
    if (_native) return _native;
    throw new CategorizedMLWorkerError(
        "init",
        `ML is unavailable: ${_nativeLoadError ?? "not loaded"}`,
    );
};

const assetStore = () => {
    if (_assetStore) return _assetStore;
    throw new CategorizedMLWorkerError(
        "init",
        `ML is unavailable: ${_nativeLoadError ?? "asset store not loaded"}`,
    );
};

const logMLRuntimeEvents = (native: MLNative) => {
    for (const { severity, message } of native.takeMlRuntimeEvents()) {
        const s = `[ml-rt] ${message}`;
        if (severity == "severe") log.error(s);
        else if (severity == "warning") log.warn(s);
        else log.info(s);
    }
};

const _indexingModelPaths = new Map<
    number,
    Promise<MLNativeModule.ModelPaths>
>();

const indexingModelPaths = (
    runFaces: boolean,
    runClip: boolean,
    runPets: boolean,
) => {
    const key =
        Number(runFaces) | (Number(runClip) << 1) | (Number(runPets) << 2);
    let promise = _indexingModelPaths.get(key);
    if (!promise) {
        promise = assetStore()
            .indexingModelPaths(runFaces, runClip, runPets)
            .catch((e: unknown) => {
                _indexingModelPaths.delete(key);
                throw e;
            });
        _indexingModelPaths.set(key, promise);
    }
    return promise;
};

let _preparedRuntimeKey: string | undefined;

const ensureMLRuntime = (
    native: MLNative,
    modelPaths: MLNativeModule.ModelPaths,
) => {
    const key = JSON.stringify(modelPaths);
    if (_preparedRuntimeKey == key) return;
    native.initMlRuntime(modelPaths);
    _preparedRuntimeKey = key;
};

export const releaseMLRuntime = () => {
    if (!_native) return;
    _native.releaseMlRuntime();
    _preparedRuntimeKey = undefined;
    logMLRuntimeEvents(_native);
};

export interface MLWorkerAnalyzeImageRequest {
    fileID: number;
    path?: string | undefined;
    bytes?: Uint8Array | undefined;
    runFaces: boolean;
    runClip: boolean;
    runPets: boolean;
    generateFaceCrops: boolean;
}

export const analyzeImage = async (
    req: MLWorkerAnalyzeImageRequest,
): Promise<MLWorkerAnalyzeImageResponse> => {
    try {
        return { ok: true, result: await analyzeImageOrThrow(req) };
    } catch (e) {
        return { ok: false, error: categorizeAnalyzeImageError(e) };
    }
};

const analyzeImageOrThrow = async (req: MLWorkerAnalyzeImageRequest) => {
    const native = mlNative();
    try {
        return await analyzeImageOnce(native, req);
    } finally {
        logMLRuntimeEvents(native);
    }
};

// A corrupt on-disk model will fail every retry, so report an init failure that
// suspends indexing until restart.
const categorizeAnalyzeImageError = (e: unknown): MLWorkerAnalyzeImageError => {
    if (e instanceof CategorizedMLWorkerError) {
        return { kind: e.kind, message: e.message };
    }

    const message = e instanceof Error ? e.message : String(e);
    const kind: MLWorkerAnalyzeImageErrorKind = message.startsWith(
        "CorruptModel: ",
    )
        ? "init"
        : message.startsWith("Decode: ") || message.startsWith("Image: ")
          ? "image"
          : message.startsWith("Ort: ") || message.startsWith("Runtime: ")
            ? "ort"
            : "misc";
    return { kind, message };
};

const analyzeImageOnce = async (
    native: MLNative,
    req: MLWorkerAnalyzeImageRequest,
) => {
    let source;
    if (req.path !== undefined) {
        source = { imagePath: req.path };
    } else if (req.bytes) {
        source = { imageBytes: uint8ArrayToBuffer(req.bytes) };
    } else {
        throw new Error("The analyze request has neither a path nor bytes");
    }

    const modelPaths = await indexingModelPaths(
        req.runFaces,
        req.runClip,
        req.runPets,
    );
    ensureMLRuntime(native, modelPaths);
    return await native.analyzeImage({
        fileId: req.fileID,
        ...source,
        runFaces: req.runFaces,
        runClip: req.runClip,
        runPets: req.runPets,
        generateFaceCrops: req.generateFaceCrops,
        modelPaths,
    });
};

// Buffer.from(bytes) would copy the image.
const uint8ArrayToBuffer = (bytes: Uint8Array) =>
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

let _clipTextModelPaths: Promise<MLNativeModule.ClipTextModelPaths> | undefined;

const clipTextModelPaths = () =>
    (_clipTextModelPaths ??= assetStore()
        .clipTextModelPaths()
        .catch((e: unknown) => {
            _clipTextModelPaths = undefined;
            throw e;
        }));

const warmUpClipTextEncoder = async (native: MLNative) => {
    try {
        const { modelPath, vocabPath } = await clipTextModelPaths();
        await native.runClipText({
            text: "warm up text encoder",
            modelPath,
            vocabPath,
        });
    } catch (e) {
        log.warn("Failed to warm up the CLIP text encoder", e);
    } finally {
        logMLRuntimeEvents(native);
    }
};

export const computeCLIPTextEmbeddingIfAvailable = async (text: string) => {
    if (!_native) return undefined;
    const native = _native;

    const pathsOrSkip = await Promise.race([
        clipTextModelPaths(),
        // Allow an on-disk model to resolve without awaiting a download.
        wait(50).then(() => 1 as const),
    ]);

    if (typeof pathsOrSkip == "number") {
        log.info(
            "Ignoring CLIP text embedding request because model download is pending",
        );
        return undefined;
    }

    const { modelPath, vocabPath } = pathsOrSkip;
    try {
        const { embedding } = await native.runClipText({
            text,
            modelPath,
            vocabPath,
        });
        return embedding;
    } finally {
        logMLRuntimeEvents(native);
    }
};
