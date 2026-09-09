import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const abort = (message) => {
    console.error(message);
    process.exit(1);
};
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));

process.chdir(process.argv[2] ?? ".");
const root = process.cwd();
const pathsFile = ".github/scripts/ci/paths.json";
const patterns = readJSON(pathsFile)["web-lint"];
if (patterns === null) process.exit(0);
if (patterns.some((pattern) => pattern.startsWith("!"))) abort(`${pathsFile}: WASM coverage does not support negated paths`);

const { packages } = JSON.parse(execFileSync("cargo", [
    "metadata", "--no-deps", "--format-version", "1", "--locked", "--offline",
], { cwd: "rust", encoding: "utf8" }));
const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
const byDirectory = new Map(packages.map((pkg) => [dirname(pkg.manifest_path), pkg]));
const pending = [];
for (const entry of readdirSync("web/packages/wasm")) {
    const path = join("web/packages/wasm", entry, "package.json");
    if (entry.startsWith(".") || !existsSync(path)) continue;
    const { name } = readJSON(path);
    const pkg = byName.get(name);
    if (!pkg) abort(`${path}: no matching Cargo package for ${name}`);
    pending.push(dirname(pkg.manifest_path));
}
if (!pending.length) abort("No Web WASM packages found");

const directories = new Set();
while (pending.length) {
    const directory = pending.pop();
    if (directories.has(directory)) continue;
    directories.add(directory);
    const pkg = byDirectory.get(directory);
    if (!pkg) abort(`Local dependency ${directory} is outside the Rust workspace`);
    // Include optional and target-specific edges without fetching Cargo's resolved graph.
    for (const dependency of pkg.dependencies) {
        if (dependency.kind !== "dev" && dependency.path) pending.push(dependency.path);
    }
}

const required = ["rust/Cargo.lock", "rust/Cargo.toml", ...[...directories].map((dir) => `${relative(root, dir)}/**`)];
// Literal directory prefixes prove coverage of future files too.
const prefixes = patterns.filter((pattern) => /^[\w./-]+\/\*\*$/.test(pattern)).map((pattern) => pattern.slice(0, -2));
const missing = required.filter((path) => !patterns.includes(path) && !prefixes.some((prefix) => path.startsWith(prefix)));
for (const path of missing.sort()) console.error(`${pathsFile}: missing WASM dependency path ${JSON.stringify(path)}`);
process.exit(missing.length ? 1 : 0);
