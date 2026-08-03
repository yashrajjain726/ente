const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ortVersion = "1.28.0-r1";

// Our packaging enables CoreML on macOS and WebGPU elsewhere.
const ortReleaseURL = `https://github.com/ente/ort-packaging/releases/download/ort-${ortVersion}`;

// When changing ortVersion, verify the archives and update these from the
// release's .sha256 sidecars.
const ortAssetSHA256s = {
    "darwin-arm64":
        "de08b6c23398f1d6639c66519b44b06f7cd0f7c44a5ad7bade3c4d8b049c5428",
    "darwin-x64":
        "eee287e7d221a9b17928ee8f368dfaccb1467fe58fbb54fa08cab0ae903ba057",
    "linux-arm64":
        "90b9cf4501213e09f97804ac0d7d0cd80d7f5da2a5d5cc599606b11e3c35fc78",
    "linux-x64":
        "2293762c2b665e55282b677de7f8e4ae106507a72c9985bdb930685c0d902fd5",
    "win32-arm64":
        "552950610a7be5348c0d5ba6ef3ee6c3010bbe374b57d0d37f14be0408d88dec",
    "win32-x64":
        "10bdfec578e0ecc6064ea562a63e1165593cfbb2cec47250616aa64ef8456f5c",
};

const ortAssetName = (platform, arch) => {
    switch (platform) {
        case "darwin":
            return `onnxruntime-coreml-macos-${arch}-${ortVersion}.tar.gz`;
        case "linux":
            return `onnxruntime-webgpu-linux-${arch}-${ortVersion}.tar.gz`;
        case "win32":
            return `onnxruntime-webgpu-windows-${arch}-${ortVersion}.zip`;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
};

const archesForTarget = (platform, arch) =>
    platform == "darwin" ? ["arm64", "x64"] : [arch];

const installDir = (appDir) =>
    path.join(appDir, "node_modules", ".cache", "ente-onnxruntime");

const downloadONNXRuntimeIfNeeded = async (platform, arch, appDir) => {
    const asset = ortAssetName(platform, arch);
    const outDir = path.join(installDir(appDir), arch);
    const stampPath = path.join(outDir, ".ente-ort-stamp");

    try {
        if ((await fsp.readFile(stampPath, "utf8")) == asset) return;
    } catch {}

    const expected = ortAssetSHA256s[`${platform}-${arch}`];
    if (!expected) throw new Error(`No pinned SHA-256 for ${platform}-${arch}`);

    console.log(`Downloading ${asset}`);
    const res = await fetch(`${ortReleaseURL}/${asset}`);
    if (!res.ok)
        throw new Error(`Failed to download ${asset}: HTTP ${res.status}`);
    const archive = Buffer.from(await res.arrayBuffer());

    const actual = crypto.createHash("sha256").update(archive).digest("hex");
    if (actual != expected)
        throw new Error(
            `SHA-256 mismatch for ${asset}: expected ${expected}, got ${actual}`,
        );

    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });
    const archivePath = path.join(outDir, asset);
    await fsp.writeFile(archivePath, archive);
    // Windows ships bsdtar, which also extracts zip archives.
    execFileSync("tar", ["-xf", asset], { cwd: outDir });
    await fsp.rm(archivePath);
    await fsp.writeFile(stampPath, asset);
};

const stageONNXRuntime = async (platform, arch, appDir) => {
    const arches = archesForTarget(platform, arch);
    const sourceRoot = installDir(appDir);
    const stageRoot = path.join(appDir, "build", "onnxruntime");

    for (const a of arches) {
        const expected = ortAssetName(platform, a);
        const stampPath = path.join(sourceRoot, a, ".ente-ort-stamp");
        let actual;
        try {
            actual = await fsp.readFile(stampPath, "utf8");
        } catch {
            throw new Error(
                `ONNX Runtime for ${platform}-${a} is not installed (run "npm run postinstall" first)`,
            );
        }
        if (actual != expected)
            throw new Error(
                `Installed ONNX Runtime for ${platform}-${a} is stale (run "npm run postinstall" again)`,
            );
    }

    await fsp.rm(stageRoot, { recursive: true, force: true });
    await fsp.mkdir(stageRoot, { recursive: true });
    for (const a of arches)
        await fsp.cp(path.join(sourceRoot, a), path.join(stageRoot, a), {
            recursive: true,
            verbatimSymlinks: true,
        });
};

const installONNXRuntime = async (platform, appDir) => {
    for (const arch of ["arm64", "x64"])
        await downloadONNXRuntimeIfNeeded(platform, arch, appDir);
};

const main = () => {
    const appDir = path.resolve(__dirname, "..");
    return installONNXRuntime(process.platform, appDir);
};

module.exports = { stageONNXRuntime };

if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
