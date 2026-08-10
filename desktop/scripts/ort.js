const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ortVersion = "1.28.0-r3";

// Our packaging enables CoreML on macOS and WebGPU elsewhere.
const ortReleaseURL = `https://github.com/ente/ort-packaging/releases/download/ort-${ortVersion}`;

// When changing ortVersion, verify the archives and update these from the
// release's .sha256 sidecars.
const ortAssetSHA256s = {
    "darwin-arm64":
        "5f5bf25a65756c25ab13b331c90d5b4324e59bb669dfc1b3bf2d060a8760c0f3",
    "darwin-x64":
        "8be0681d58f0398cf8fbc52cf5a10aa5ee0f7976c45dca81598dd562575a8cdc",
    "linux-arm64":
        "343572e7a09565d517bb2802fed5b27c8a950337dafa99a4d8bc4fe06acb5485",
    "linux-x64":
        "8478974b222df6ce9069976a4bbf99a89f0604565c350bb9a40565a3ec43e05d",
    "win32-arm64":
        "bb31227878d7684ff1ef80a90bea7e95d4868db91e4751dfa5af6ae9b3b6adcd",
    "win32-x64":
        "d6984f7fafd1d4cd7b3969654e919e148c0b697ffffa64d4f203549615d59877",
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
