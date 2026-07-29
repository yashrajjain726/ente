/**
 * [Note: ONNX Runtime binaries]
 *
 * The Rust ML addon (see [Note: ML with Rust]) loads the ONNX Runtime
 * dynamic library at runtime. We use Ente's pinned custom builds — CoreML
 * enabled on macOS, WebGPU-capable elsewhere — published at
 * https://github.com/laurens-pilot/ort-packaging/releases
 *
 * This script downloads the archive for the relevant OS/arch combination,
 * verifies it against the SHA-256 checksums pinned below, and extracts it
 * into `build/onnxruntime/<arch>`. From there it gets used during
 * development, and copied into the packaged app's resources by the
 * "extraFiles" clause in `electron-builder.yml`.
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

const version = "1.27.0-r4";

const releaseURL = `https://github.com/laurens-pilot/ort-packaging/releases/download/ort-${version}`;

/**
 * SHA-256 checksums of the release assets, pinned here so that the library we
 * package cannot change without a corresponding (reviewed) change to this
 * file. When bumping {@link version}, update these with the values from the
 * release's `.sha256` sidecar files after verifying them against the built
 * archives.
 */
const assetSHA256s = {
    "darwin-arm64":
        "dbb243c3b43963fda6c9475a978d0954b69490d386bc3ecb54a471b2a13ba043",
    "darwin-x64":
        "d655686380c1976a9067a48d82645a381e4bc4bdfcc44c88f300befc24c4ae8e",
    "linux-arm64":
        "0b0367bddd96fb0263781022f715ec531a9856e14d8ed91beea80da8d9bb6a2e",
    "linux-x64":
        "d417b8d92498f3e754e23fbeac0751f13375061c6c31cc83e869f33a37fca8ad",
    "win32-arm64":
        "9e3179a985e08700b37f15af7049bca4fc007cb4d5a7e2ff1d81df10e330544e",
    "win32-x64":
        "0534f35981fe3174379c7e80f93977edd990ce67c40f6cbdde1e6890eb798911",
};

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

    const expected = assetSHA256s[`${platform}-${arch}`];
    if (!expected) throw new Error(`No pinned SHA-256 for ${platform}-${arch}`);

    console.log(`Downloading ${asset}`);
    const res = await fetch(`${releaseURL}/${asset}`);
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
    // tar is available on all the platforms we build on (bsdtar on macOS and
    // Windows, GNU tar on Linux), and handles both .tar.gz and .zip.
    execFileSync("tar", ["-xf", asset], { cwd: outDir });
    await fsp.rm(archivePath);
    await fsp.writeFile(stampPath, asset);
};

/**
 * Ensure `<appDir>/build/onnxruntime` contains exactly the ONNX Runtime
 * libraries needed for the given OS/arch combination.
 *
 * On macOS the packaged app is universal, so both architectures are kept. On
 * Linux and Windows only the given arch is kept: unlike vips (a single file
 * that gets overwritten in place per arch), the libraries live in per-arch
 * directories, so directories left over from earlier passes for other
 * architectures need to be removed lest they also get copied into the
 * package.
 */
const ensureONNXRuntime = async (platform, arch, appDir) => {
    const arches = platform == "darwin" ? ["arm64", "x64"] : [arch];
    for (const a of arches)
        await downloadONNXRuntimeIfNeeded(platform, a, appDir);

    const outDir = path.join(appDir, "build", "onnxruntime");
    for (const entry of await fsp.readdir(outDir))
        if (!arches.includes(entry))
            await fsp.rm(path.join(outDir, entry), { recursive: true });
};

const main = () => ensureONNXRuntime(process.platform, process.arch, ".");

module.exports = { ensureONNXRuntime };

if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
