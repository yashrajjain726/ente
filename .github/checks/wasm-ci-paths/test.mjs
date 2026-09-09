import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const script = join(import.meta.dirname, "check.mjs");
const pathsFile = ".github/scripts/ci/paths.json";

test("Web CI covers transitive local WASM dependencies", (t) => {
    const root = mkdtempSync(join(tmpdir(), "ente-wasm-ci-paths-"));
    t.after(() => rmSync(root, { recursive: true }));
    const write = (path, content) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    };
    const crate = (path, name, dependencies = "") => {
        write(`rust/${path}/src/lib.rs`, "");
        write(`rust/${path}/Cargo.toml`, `
[package]
name = "${name}"
version = "0.1.0"
edition = "2024"
${dependencies}`);
    };
    const check = (patterns, errors = []) => {
        write(pathsFile, JSON.stringify({ "web-lint": patterns }));
        const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, errors.map((error) => `${pathsFile}: ${error}\n`).join(""));
        assert.equal(result.status, errors.length ? 1 : 0);
    };

    write("rust/Cargo.toml", `
[workspace]
resolver = "2"
members = ["bindings/wasm/*", "crates/*"]
[workspace.dependencies]
shared-alias = { package = "shared", path = "crates/shared" }
`);
    write("web/packages/wasm/app/package.json", JSON.stringify({ name: "app-wasm" }));
    crate("bindings/wasm/app", "app-wasm", `
[dependencies]
shared-alias.workspace = true
[build-dependencies]
builder = { path = "../../../crates/builder" }
[dev-dependencies]
test-only = { path = "../../../crates/test-only" }
`);
    crate("crates/shared", "shared", `
[target.'cfg(windows)'.dependencies]
leaf = { path = "../leaf", optional = true }
`);
    for (const name of ["builder", "leaf", "test-only", "native-only"]) crate(`crates/${name}`, name);
    crate("bindings/wasm/unused", "unused-wasm", `
[dependencies]
native-only = { path = "../../../crates/native-only" }
`);

    const base = ["rust/Cargo.lock", "rust/Cargo.toml", "rust/bindings/wasm/**"];
    const needed = ["builder", "leaf", "shared"].map((name) => `rust/crates/${name}/**`);
    const incomplete = [...base, "rust/crates/shared-other/**", "rust/crates/leaf/Cargo.toml"];
    check(incomplete, needed.map((path) => `missing WASM dependency path ${JSON.stringify(path)}`));
    check([...base, ...needed]);
    check(["rust/**"]);
    check(null);
    check([...base, ...needed, "!rust/crates/leaf/private/**"], ["WASM coverage does not support negated paths"]);
});
