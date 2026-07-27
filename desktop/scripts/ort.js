/**
 * [Note: ONNX Runtime binaries]
 *
 * The Rust ML addon (see [Note: ML with Rust]) loads the ONNX Runtime
 * dynamic library at runtime. We use Ente's pinned custom builds — CoreML
 * enabled on macOS, WebGPU-capable elsewhere — published at
 * https://github.com/laurens-pilot/ort-packaging/releases
 *
 * This script downloads the archive for the relevant OS/arch combination,
 * verifies it against the release's SHA-256 sidecar, and extracts it into
 * `build/onnxruntime/<arch>`. From there it gets used during development, and
 * copied into the packaged app's resources by the "extraFiles" clause in
 * `electron-builder.yml`.
 *
 * On macOS both architectures are downloaded since the packaged app is a
 * universal binary. Like `vips.js`, this script runs during "npm install"
 * (via postinstall), while `beforeBuild.js` additionally invokes it for the
 * specific architecture being packaged (which on CI might differ from the
 * architecture we're running on).
 */

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const version = "1.27.0-r2";

const releaseURL = `https://github.com/laurens-pilot/ort-packaging/releases/download/ort-${version}`;

const assetName = (platform, arch) => {
    switch (platform) {
        case "darwin":
            return `onnxruntime-coreml-macos-${arch}-${version}.tar.gz`;
        case "linux":
            return `onnxruntime-webgpu-linux-${arch}-${version}.tar.gz`;
        case "win32":
            return `onnxruntime-webgpu-windows-${arch}-${version}.zip`;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
};

/**
 * Download and extract the ONNX Runtime library for the given OS/arch into
 * `<appDir>/build/onnxruntime/<arch>`, no-oping if it is already there.
 */
const downloadONNXRuntimeIfNeeded = async (platform, arch, appDir) => {
    const asset = assetName(platform, arch);
    const outDir = path.join(appDir, "build", "onnxruntime", arch);
    const stampPath = path.join(outDir, ".ente-ort-stamp");

    try {
        if ((await fsp.readFile(stampPath, "utf8")) == asset) return;
    } catch {}

    console.log(`Downloading ${asset}`);
    const download = async (name) => {
        const res = await fetch(`${releaseURL}/${name}`);
        if (!res.ok)
            throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    };

    const [archive, sidecar] = await Promise.all([
        download(asset),
        download(`${asset}.sha256`),
    ]);

    const expected = sidecar.toString("utf8").trim().split(/\s+/)[0];
    const actual = crypto.createHash("sha256").update(archive).digest("hex");
    if (actual != expected)
        throw new Error(
            `SHA-256 mismatch for ${asset}: expected ${expected}, got ${actual}`,
        );

    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });
    const archivePath = path.join(outDir, asset);
    await fsp.writeFile(archivePath, archive);
    // tar is available on all the platforms we build on (bsdtar on macOS and
    // Windows, GNU tar on Linux), and handles both .tar.gz and .zip.
    execFileSync("tar", ["-xf", asset], { cwd: outDir });
    await fsp.rm(archivePath);
    await fsp.writeFile(stampPath, asset);
};

const main = async () => {
    const arches =
        process.platform == "darwin" ? ["arm64", "x64"] : [process.arch];
    for (const arch of arches)
        await downloadONNXRuntimeIfNeeded(process.platform, arch, ".");
};

module.exports = { downloadONNXRuntimeIfNeeded };

if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
