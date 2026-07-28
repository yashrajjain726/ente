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

const version = "1.27.0-r2";

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
        "3249212d99a22b5c3a7fecf5d7269938475f6cc2dbb5ca98f43f1b5887d5b80f",
    "darwin-x64":
        "11264a993b1dd9c25c9fc52c777052aa90cc1e2fe2e6145bba9d397ec86ae3cd",
    "linux-arm64":
        "f83f463d37c9a7bce0482202cb5c75b519c0e41dd5c194ad629f9f2b920bfc18",
    "linux-x64":
        "bfd679770f0a5a2c186980e565cd7d1eaee1491ff1f038d079d73f382eb81b76",
    "win32-arm64":
        "1fd74f7dadd9d9c58d0573cdeb789d6deaa7d744333c2dd5285f9c88e4f957b6",
    "win32-x64":
        "d20661b8af1cce1a6d5577e32da22edba940d547b8247ffc143f9735a8afe87b",
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
