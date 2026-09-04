import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const requestedRoot = resolve(process.argv[2]);
const metadata = JSON.parse(
    execFileSync(
        "cargo",
        [
            "metadata",
            "--no-deps",
            "--format-version",
            "1",
            "--locked",
            "--offline",
        ],
        { cwd: resolve(requestedRoot, "rust"), encoding: "utf8" },
    ),
);
const root = resolve(metadata.workspace_root, "..");
const bindings = resolve(root, "rust/bindings");
const framework = /^(?:wasm-bindgen(?:-.*)?|js-sys|web-sys|serde-wasm-bindgen|tsify(?:-.*)?|flutter_rust_bridge(?:_.*)?|uniffi(?:_.*)?|napi(?:-.*)?)$/;
const pathFromRoot = (path) => relative(root, path).split(sep).join("/");
const domain = metadata.packages.filter((pkg) =>
    pathFromRoot(pkg.manifest_path).startsWith("rust/crates/"),
);

if (!domain.length) {
    console.error(`${resolve(root, "rust/crates")}: found no domain crates`);
    process.exitCode = 1;
}

for (const pkg of domain) {
    const manifest = pathFromRoot(pkg.manifest_path);
    for (const dependency of pkg.dependencies) {
        if (!framework.test(dependency.name) && !inside(bindings, dependency.path)) continue;
        console.error(
            `${manifest}: dependency ${JSON.stringify(dependency.name)} crosses the Rust binding boundary`,
        );
        process.exitCode = 1;
    }
}

const registered = new Set(domain.map((pkg) => pathFromRoot(pkg.manifest_path)));
for (const manifest of git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "rust/crates/**/Cargo.toml",
)
    .split("\0")
    .filter((path) => path && existsSync(resolve(root, path)))) {
    if (registered.has(manifest)) continue;
    console.error(`${manifest}: domain crate is not registered in the Cargo workspace`);
    process.exitCode = 1;
}

function git(...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function inside(directory, path) {
    if (!path) return false;
    const local = relative(directory, path);
    return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}
