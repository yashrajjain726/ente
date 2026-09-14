import { basename } from "node:path";

const routineBinary = (file) =>
    /\.(png|jpe?g|webp|gif|ico|icns|ttf|otf|woff2?|riv|mp3)$/i.test(file) ||
    file.includes("Assets.xcassets/");
const guardrailDirs = [
    "apple/scripts/",
    "mobile/checks/",
    "mobile/scripts/",
    "rust/checks/",
    "rust/scripts/",
    "web/checks/",
    "web/scripts/",
    "server/scripts/",
    "web/packages/build-config/",
];
const guardrailFiles = new Set([
    "apple/Package.swift",
    ".swift-format",
    ".swiftlint.yml",
    "rustfmt.toml",
    ".rustfmt.toml",
    "eslint.config.mjs",
    ".prettierrc.json",
    "analysis_options.yaml",
]);
const configFile =
    /(^|\/)(\.gitattributes|\.?clippy\.toml|rust-toolchain\.toml|\.cargo\/(config|audit)\.toml|\.npmrc|\.nvmrc|\.tool-versions|\.node-version|\.python-version|gradle-wrapper\.properties)$/;

export function checkFiles({ files }) {
    const binaries = files
        .filter(
            ({ path, binary, deleted }) =>
                binary && !deleted && !routineBinary(path),
        )
        .map(({ path, size }) => ({ path, size }));
    const large = files
        .filter(({ added, size }) => added && size > 1024 * 1024)
        .map(({ path, size }) => ({ path, size }));
    const guardrails = files
        .filter(
            ({ path, added }) =>
                path.startsWith(".github/") ||
                (!added && guardrailDirs.some((dir) => path.startsWith(dir))) ||
                guardrailFiles.has(path) ||
                guardrailFiles.has(basename(path)),
        )
        .map(({ path }) => path);
    const configs = files
        .filter(({ path }) => configFile.test(path))
        .map(({ path }) => path);
    return { binaries, large, guardrails, configs };
}
