import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const check = join(import.meta.dirname, "check.mjs");
const root = mkdtempSync(join(tmpdir(), "ente-android-lint-exceptions-"));
try {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    mkdirSync(join(root, "android/checks/lint-exceptions"), {
        recursive: true,
    });
    for (const [extension, source] of [
        ["kt", '@Suppress("NewApi") fun example() {}'],
        ["kts", '@file:Suppress("NewApi")'],
        ["kt", '@file:[Suppress("NewApi")]'],
        ["kt", '@Suppress(\n/* reason */ "NewApi",\n) fun example() {}'],
        ["kt", '@Suppress(names = ["NewApi"]) fun example() {}'],
        ["kt", '@Suppress(names = arrayOf("NewApi")) fun example() {}'],
        [
            "kt",
            'import kotlin.Suppress as Quiet\n@Quiet("NewApi") fun example() {}',
        ],
        ["java", '@android.annotation.SuppressLint("NewApi") class Example {}'],
        ["java", '@SuppressWarnings(value = {"NewApi"}) class Example {}'],
        ["java", "//noinspection NewApi\nclass Example {}"],
        ["xml", '<view tools:ignore="NewApi" />'],
        [
            "xml",
            '<view xmlns:lint="http://schemas.android.com/tools" lint:ignore="NewApi" />',
        ],
    ]) {
        assert.equal(run(extension, source).status, 1);
        const file = `android/Example.${extension}`;
        const result = run(extension, source, { [file]: ["NewApi"] });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            run(extension, source, { "android/Other.kt": ["NewApi"] }).status,
            1,
        );
    }
    for (const source of [
        '@Suppress("NewApi", "MissingPermission")',
        '@Suppress("all")',
        "@Suppress(RULE)",
        '@Suppress("New" + "Api")',
        "//noinspection",
    ]) {
        assert.equal(
            run("kt", source, { "android/Example.kt": ["NewApi"] }).status,
            1,
        );
    }
    for (const [extension, source] of [
        [
            "kt",
            'fun Suppress(text: String) {}\nfun example() { Suppress("NewApi") }',
        ],
        ["kt", '// @Suppress("NewApi")'],
        ["kt", '/* outer /* nested */ @Suppress("NewApi") */'],
        ["kt", 'val text = "@Suppress(\\"NewApi\\")"'],
        [
            "kt",
            'val text = """\n@Suppress("NewApi")\n//noinspection NewApi\n"""',
        ],
        ["xml", '<!-- <view tools:ignore="NewApi" /> -->'],
        ["xml", '<value><![CDATA[tools:ignore="NewApi"]]></value>'],
        ["xml", '<string name="example">tools:ignore="NewApi"</string>'],
        ["xml", `<view text='tools:ignore="NewApi"' />`],
    ]) {
        const result = run(extension, source);
        assert.equal(result.status, 0, result.stderr);
    }
    const suppression = '@SuppressLint("NewApi") fun example() {}\n';
    for (const source of [suppression + suppression, suppression]) {
        const result = run("kt", source, { "android/Example.kt": ["NewApi"] });
        assert.equal(result.status, 0, result.stderr);
    }
    for (const source of ["fun example() {}", null]) {
        const result = run("kt", source, { "android/Example.kt": ["NewApi"] });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /NewApi has no suppression/);
        assert.equal(run("kt", source).status, 0);
    }
} finally {
    rmSync(root, { recursive: true });
}

function run(extension, source, allowed = {}) {
    for (const extension of ["kt", "kts", "java", "xml"]) {
        rmSync(join(root, `android/Example.${extension}`), { force: true });
    }
    if (source !== null)
        writeFileSync(join(root, `android/Example.${extension}`), source);
    writeFileSync(
        join(root, "android/checks/lint-exceptions/suppressions.json"),
        JSON.stringify(allowed),
    );
    return spawnSync(process.execPath, [check, root], { encoding: "utf8" });
}
