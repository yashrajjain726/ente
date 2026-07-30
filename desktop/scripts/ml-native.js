/**
 * [Note: Packaging the ML addon]
 *
 * The Rust ML addon (see [Note: ML with Rust]) is built from source by
 * `cargo codegen napi` (which our postinstall runs) into the gitignored
 * `rust-bindings/` directory, where the development app loads it from.
 *
 * When packaging, the addon(s) for the architectures being built are staged
 * into `build/ml-native/`, which the "extraFiles" clause in
 * `electron-builder.yml` copies into the packaged app's resources. On macOS
 * the packaged app is universal, so both the arm64 and x64 addons must be
 * present (and identical) in every per-arch build that gets merged; anything
 * that is not the host architecture is cross-compiled, so this script installs
 * the corresponding Rust target as needed (`rustup target add ...`).
 */

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
const { execFileSync, execSync } = require("node:child_process");

const ortVersion = "1.27.0-r4";

const ortReleaseURL = `https://github.com/laurens-pilot/ort-packaging/releases/download/ort-${ortVersion}`;

/**
 * SHA-256 checksums of the release assets, pinned here so that the library we
 * package cannot change without a corresponding (reviewed) change to this
 * file. When bumping {@link ortVersion}, update these with the values from the
 * release's `.sha256` sidecar files after verifying them against the built
 * archives.
 */
const ortAssetSHA256s = {
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

/**
 * Download and extract the ONNX Runtime library for the given OS/arch into
 * `<appDir>/build/onnxruntime/<arch>`, no-oping if it is already there.
 */
const downloadONNXRuntimeIfNeeded = async (platform, arch, appDir) => {
    const asset = ortAssetName(platform, arch);
    const outDir = path.join(appDir, "build", "onnxruntime", arch);
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
    const arches = archesForTarget(platform, arch);
    for (const a of arches)
        await downloadONNXRuntimeIfNeeded(platform, a, appDir);

    const outDir = path.join(appDir, "build", "onnxruntime");
    for (const entry of await fsp.readdir(outDir))
        if (!arches.includes(entry))
            await fsp.rm(path.join(outDir, entry), { recursive: true });
};

/** napi-cli's name for the addon built for the given platform-arch. */
const napiTriple = (platform, arch) => {
    switch (`${platform}-${arch}`) {
        case "darwin-arm64":
            return "darwin-arm64";
        case "darwin-x64":
            return "darwin-x64";
        case "linux-x64":
            return "linux-x64-gnu";
        case "linux-arm64":
            return "linux-arm64-gnu";
        case "win32-x64":
            return "win32-x64-msvc";
        case "win32-arm64":
            return "win32-arm64-msvc";
        default:
            throw new Error(`Unsupported platform-arch: ${platform}-${arch}`);
    }
};

/** The Rust target triple for the given platform-arch. */
const rustTriple = (platform, arch) => {
    switch (`${platform}-${arch}`) {
        case "darwin-arm64":
            return "aarch64-apple-darwin";
        case "darwin-x64":
            return "x86_64-apple-darwin";
        case "linux-x64":
            return "x86_64-unknown-linux-gnu";
        case "linux-arm64":
            return "aarch64-unknown-linux-gnu";
        case "win32-x64":
            return "x86_64-pc-windows-msvc";
        case "win32-arm64":
            return "aarch64-pc-windows-msvc";
        default:
            throw new Error(`Unsupported platform-arch: ${platform}-${arch}`);
    }
};

/** Install the given Rust target for the active toolchain if it is missing. */
const ensureRustTarget = (target, appDir) => {
    const installed = execFileSync(
        "rustup",
        ["target", "list", "--installed"],
        { cwd: appDir, encoding: "utf8" },
    ).split(/\r?\n/);
    if (installed.includes(target)) return;

    console.log(`Installing Rust target ${target}`);
    execFileSync("rustup", ["target", "add", target], {
        cwd: appDir,
        stdio: "inherit",
    });
};

/**
 * Build the addon for the given platform-arch into `rust-bindings/`.
 *
 * The build always runs so that edits to the Rust sources cannot be missed
 * when packaging; cargo's incremental compilation makes this cheap when
 * nothing has changed. Linux always uses napi-cli's cross toolchain, including
 * for the host architecture, to keep the addon's glibc requirement at 2.17.
 */
const buildAddon = async (appDir, platform, arch) => {
    if (arch != process.arch)
        ensureRustTarget(rustTriple(platform, arch), appDir);

    const addonPath = path.join(
        appDir,
        "rust-bindings",
        `index.${napiTriple(platform, arch)}.node`,
    );

    const cmd = [
        "npm exec -- napi build",
        "--manifest-path ../rust/bindings/napi/photos/Cargo.toml",
        "--target-dir ../rust/target",
        "--release --strip --platform --no-js",
        "--dts index.d.ts",
        "--output-dir rust-bindings",
        ...(platform == "linux" || arch != process.arch
            ? [
                  `--target ${rustTriple(platform, arch)}`,
                  ...(platform == "linux" ? ["--use-napi-cross"] : []),
              ]
            : []),
    ].join(" ");
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd: appDir, stdio: "inherit" });

    await fsp.access(addonPath);
    return addonPath;
};

/**
 * Ensure the addon(s) needed when packaging for the given platform-arch are
 * built and staged into `build/ml-native/`.
 */
const stageMLAddons = async (appDir, platform, arch) => {
    // On macOS the packaged app is universal, so both architectures must be
    // staged regardless of which arch this build pass is for.
    const arches = archesForTarget(platform, arch);

    const stageDir = path.join(appDir, "build", "ml-native");
    await fsp.mkdir(stageDir, { recursive: true });

    const wanted = [];
    for (const a of arches) {
        const addonPath = await buildAddon(appDir, platform, a);
        wanted.push(path.basename(addonPath));
        await fsp.copyFile(
            addonPath,
            path.join(stageDir, path.basename(addonPath)),
        );
    }

    // Remove addons staged by earlier passes for other platforms or
    // architectures so that they don't get copied into this package.
    for (const entry of await fsp.readdir(stageDir))
        if (!wanted.includes(entry))
            await fsp.rm(path.join(stageDir, entry), { recursive: true });
};

const main = async () => {
    const appDir = path.resolve(__dirname, "..");
    await ensureONNXRuntime(process.platform, process.arch, appDir);
    execSync("cargo codegen napi", {
        cwd: path.resolve(appDir, "..", "rust"),
        stdio: "inherit",
    });
};

module.exports = { ensureONNXRuntime, napiTriple, stageMLAddons };

if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
