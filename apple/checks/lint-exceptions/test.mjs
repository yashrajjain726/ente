import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const check = join(import.meta.dirname, "check.mjs");
const root = mkdtempSync(join(tmpdir(), "ente-apple-lint-exceptions-"));
const file = "apple/Example.swift";
try {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    mkdirSync(join(root, "apple/checks/lint-exceptions"), { recursive: true });
    for (const [source, rule] of [
        [
            "// swift-format-ignore: NeverForceUnwrap\nlet value = optional!",
            "NeverForceUnwrap",
        ],
        [
            "// swiftlint:disable:next empty_count\nlet empty = values.count == 0",
            "empty_count",
        ],
        [
            "let empty = values.count == 0 // swiftlint:disable:this empty_count",
            "empty_count",
        ],
        ["/* swiftlint:disable empty_count */", "empty_count"],
        [
            "/* outer /* nested */ swiftlint:disable empty_count */",
            "empty_count",
        ],
    ]) {
        assert.equal(run(source).status, 1);
        const result = run(source, { [file]: [rule] });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(run(source, { "apple/Other.swift": [rule] }).status, 1);
    }
    for (const source of [
        "// swift-format-ignore",
        "// swift-format-ignore-file",
        "// swiftlint:disable all",
        "// swiftlint:disable",
        "// swiftlint:disable empty_count force_cast",
    ]) {
        assert.equal(run(source, { [file]: ["empty_count"] }).status, 1);
    }
    for (const source of [
        "// swiftlint:enable empty_count",
        'let text = "// swiftlint:disable empty_count"',
        'let text = #"a "quote" // swiftlint:disable empty_count"#',
        'let text = """\n// swift-format-ignore-file\n"""',
        'let text = #"""\n""" // swift-format-ignore-file\n"""#',
    ]) {
        const result = run(source);
        assert.equal(result.status, 0, result.stderr);
    }
    const suppression =
        "// swiftlint:disable:next empty_count\nlet empty = values.count == 0\n";
    for (const source of [suppression + suppression, suppression]) {
        const result = run(source, { [file]: ["empty_count"] });
        assert.equal(result.status, 0, result.stderr);
    }
    for (const source of ["let value = 1", null]) {
        const result = run(source, { [file]: ["empty_count"] });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /empty_count has no suppression/);
        assert.equal(run(source).status, 0);
    }
} finally {
    rmSync(root, { recursive: true });
}

function run(source, allowed = {}) {
    if (source === null) rmSync(join(root, file), { force: true });
    else writeFileSync(join(root, file), source);
    writeFileSync(
        join(root, "apple/checks/lint-exceptions/suppressions.json"),
        JSON.stringify(allowed),
    );
    return spawnSync(process.execPath, [check, root], { encoding: "utf8" });
}
