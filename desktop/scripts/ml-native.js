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
 * that is not the host architecture is cross-compiled, which requires the
 * corresponding Rust target to be installed (`rustup target add ...`).
 */

const fsp = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");

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

/**
 * Build the addon for the given platform-arch into `rust-bindings/`.
 *
 * The build always runs so that edits to the Rust sources cannot be missed
 * when packaging; cargo's incremental compilation makes this cheap when
 * nothing has changed. For the host architecture we omit `--target` so that
 * the build shares the cargo cache of the `cargo codegen napi` that
 * postinstall runs (which also omits it).
 */
const buildAddon = async (appDir, platform, arch) => {
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
        ...(arch != process.arch
            ? [
                  `--target ${rustTriple(platform, arch)}`,
                  // Cross-compiling for the other Linux architecture needs a
                  // gcc cross toolchain; let napi-cli download its prebuilt
                  // one.
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
    const arches = platform == "darwin" ? ["arm64", "x64"] : [arch];

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

module.exports = { stageMLAddons };
