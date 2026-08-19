import { base64ToBytes, bytesToBase64 } from "@/services/base64";
import { isTauriRuntime } from "@/services/tauri-runtime";

type EnsuWasmModule = typeof import("ente-ensu-wasm");

export interface EncryptedChatPayload {
    encryptedData: string;
    header: string;
}

export interface EnsuCrypto {
    generateKey(): Promise<string>;
    encryptPayload(
        value: string,
        keyB64: string,
    ): Promise<EncryptedChatPayload>;
    decryptPayload(
        encryptedDataB64: string,
        headerB64: string,
        keyB64: string,
    ): Promise<string>;
    encryptField(value: string, keyB64: string): Promise<string>;
    decryptField(value: string, keyB64: string): Promise<string>;
    encryptAttachment(
        data: Uint8Array,
        keyB64: string,
        sessionUuid: string,
    ): Promise<Uint8Array<ArrayBuffer>>;
    decryptAttachment(
        data: Uint8Array,
        keyB64: string,
        sessionUuid: string,
    ): Promise<Uint8Array<ArrayBuffer>>;
}

const encryptedChatPayloadValue = (
    payload: ReturnType<EnsuWasmModule["encryptChatPayload"]>,
) => {
    try {
        return { encryptedData: payload.encryptedData, header: payload.header };
    } finally {
        payload.free();
    }
};

const wasmBytes = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

const createWasmClient = (wasm: EnsuWasmModule): EnsuCrypto => ({
    generateKey: () => Promise.resolve(wasm.generateChatKey()),
    encryptPayload: (value, keyB64) =>
        Promise.resolve(
            encryptedChatPayloadValue(wasm.encryptChatPayload(value, keyB64)),
        ),
    decryptPayload: (encryptedDataB64, headerB64, keyB64) =>
        Promise.resolve(
            wasm.decryptChatPayload(encryptedDataB64, headerB64, keyB64),
        ),
    encryptField: (value, keyB64) =>
        Promise.resolve(wasm.encryptChatField(value, keyB64)),
    decryptField: (value, keyB64) =>
        Promise.resolve(wasm.decryptChatField(value, keyB64)),
    encryptAttachment: (data, keyB64, sessionUuid) =>
        Promise.resolve(
            wasmBytes(wasm.encryptChatAttachment(data, keyB64, sessionUuid)),
        ),
    decryptAttachment: (data, keyB64, sessionUuid) =>
        Promise.resolve(
            wasmBytes(wasm.decryptChatAttachment(data, keyB64, sessionUuid)),
        ),
});

const createTauriClient = async (): Promise<EnsuCrypto> => {
    const { invoke } = (await import("@tauri-apps/api/core")) as {
        invoke: <T>(
            command: string,
            args?: Record<string, unknown>,
        ) => Promise<T>;
    };

    const toNativeError = (code: string, message: string) =>
        Object.assign(new Error(message), { code });

    const invokeOrThrow = async <T>(
        command: string,
        args?: Record<string, unknown>,
    ) => {
        try {
            return await invoke<T>(command, args);
        } catch (error) {
            if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                "message" in error
            ) {
                const code =
                    typeof error.code === "string"
                        ? error.code
                        : "native_error";
                const message =
                    typeof error.message === "string"
                        ? error.message
                        : "Unknown error";

                if (error instanceof Error) {
                    (error as Error & { code?: string }).code = code;
                    throw error;
                }

                throw toNativeError(code, message);
            }

            if (typeof error === "string") {
                try {
                    const parsed = JSON.parse(error) as {
                        code?: string;
                        message?: string;
                    };
                    if (parsed.code && parsed.message) {
                        throw toNativeError(parsed.code, parsed.message);
                    }
                } catch {
                    // Not a structured native error; use the generic wrapper.
                }
                throw toNativeError("native_error", error);
            }

            if (error instanceof Error) {
                try {
                    const parsed = JSON.parse(error.message) as {
                        code?: string;
                        message?: string;
                    };
                    if (parsed.code && parsed.message) {
                        throw toNativeError(parsed.code, parsed.message);
                    }
                } catch {
                    // Not a structured native error; use the generic wrapper.
                }
                throw toNativeError("native_error", error.message);
            }

            throw toNativeError("native_error", "Unknown error");
        }
    };

    return {
        generateKey: () => invokeOrThrow<string>("chat_crypto_generate_key"),
        encryptPayload: (value, keyB64) =>
            invokeOrThrow<EncryptedChatPayload>("chat_crypto_encrypt_payload", {
                input: { value, keyB64 },
            }),
        decryptPayload: (encryptedDataB64, headerB64, keyB64) =>
            invokeOrThrow<string>("chat_crypto_decrypt_payload", {
                input: { encryptedDataB64, headerB64, keyB64 },
            }),
        encryptField: (value, keyB64) =>
            invokeOrThrow<string>("chat_crypto_encrypt_field", {
                input: { value, keyB64 },
            }),
        decryptField: (value, keyB64) =>
            invokeOrThrow<string>("chat_crypto_decrypt_field", {
                input: { value, keyB64 },
            }),
        encryptAttachment: async (data, keyB64, sessionUuid) =>
            base64ToBytes(
                await invokeOrThrow<string>("chat_crypto_encrypt_attachment", {
                    input: {
                        dataB64: bytesToBase64(data),
                        keyB64,
                        sessionUuid,
                    },
                }),
            ),
        decryptAttachment: async (data, keyB64, sessionUuid) =>
            base64ToBytes(
                await invokeOrThrow<string>("chat_crypto_decrypt_attachment", {
                    input: {
                        dataB64: bytesToBase64(data),
                        keyB64,
                        sessionUuid,
                    },
                }),
            ),
    };
};

let client: Promise<EnsuCrypto> | undefined;

export const ensuCrypto = () =>
    (client ??= isTauriRuntime()
        ? createTauriClient()
        : import("ente-ensu-wasm").then(createWasmClient));
