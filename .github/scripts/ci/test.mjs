import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { failures, paths, select } from "./check.mjs";

const repository = (t) => {
    const cwd = mkdtempSync(join(tmpdir(), "ente-ci-"));
    t.after(() => rmSync(cwd, { recursive: true }));
    const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", input: "fixture\n" }).trim();
    git("init", "-q");
    const blob = git("hash-object", "-w", "--stdin");
    const tree = (files) => {
        git("read-tree", "--empty");
        for (const file of files) git("update-index", "--add", "--cacheinfo", `100644,${blob},${file}`);
        return git("write-tree");
    };
    const empty = tree([]);
    return { cwd, empty, tree, select: (files) => select(empty, tree(files), cwd) };
};

const results = (selected) => ({
    ...Object.fromEntries(Object.keys(paths).map((job) => [job, { result: selected.includes(job) ? "success" : "skipped" }])),
    select: { result: "success", outputs: { jobs: JSON.stringify(selected) } },
});

test("docs changes do not wait for unrelated workflows", (t) => {
    const selected = repository(t).select(["docs/docs/photos/faq.md"]);
    assert.deepEqual(selected, ["docs-verify-build", "repo-lint"]);
    assert.deepEqual(failures(results(selected)), []);
});

test("shared Rust changes select their consumers", (t) => {
    const repo = repository(t);
    assert.deepEqual(repo.select(["rust/crates/core/src/lib.rs"]), [
        "ensu-android-build", "ensu-ios-build", "mobile-lint", "repo-lint", "rust-lint", "rust-test", "web-lint",
    ]);
    assert.ok(repo.select(["server/pkg/api.go"]).includes("rust-test"));
    assert.ok(repo.select(["rust/bindings/napi/src/lib.rs"]).includes("desktop-lint"));
});

test("path filters cover root files, nested files, and dotfiles", (t) => {
    const repo = repository(t);
    for (const file of ["Cargo.lock", "rust/Cargo.lock", "rust/.config/Cargo.lock"]) {
        assert.ok(repo.select([file]).includes("dependency-review"), file);
    }
    for (const file of ["mobile/Podfile", "mobile/apps/photos/Podfile", "mobile/apps/photos/test.podspec"]) {
        assert.ok(repo.select([file]).includes("mobile-podfile-lock"), file);
    }
    for (const file of ["web/.prettierrc.json", "web/.config/deep/file.js", "web/apps/file\nname.js"]) {
        assert.ok(repo.select([file]).includes("web-lint"), file);
    }
    assert.deepEqual(repo.select(["README.md", "website/page.js", "CargoXlock"]), ["repo-lint"]);
    assert.deepEqual(repo.select([]), ["repo-lint"]);
    assert.ok(repo.select([".github/workflows/mobile-lint.yml"]).includes("mobile-lint"));
});

test("deletions and moves select every affected area", (t) => {
    const { cwd, empty, tree } = repository(t);
    const before = tree(["web/shared.txt"]);
    assert.deepEqual(select(before, empty, cwd), ["repo-lint", "web-lint"]);
    assert.deepEqual(select(before, tree(["desktop/shared.txt"]), cwd), ["desktop-lint", "repo-lint", "web-lint"]);
});

test("changes to CI selection or wiring run every workflow", (t) => {
    const repo = repository(t);
    for (const file of [".github/scripts/ci/paths.json", ".github/scripts/ci/check.mjs", ".github/workflows/ci.yml"]) {
        assert.deepEqual(repo.select([file]), Object.keys(paths));
    }
});

test("selected failures, cancellations, and skips block merging", () => {
    for (const result of ["failure", "cancelled", "skipped"]) {
        const needs = results(["repo-lint", "web-lint"]);
        needs["web-lint"].result = result;
        assert.notDeepEqual(failures(needs), []);
    }
});

test("failed selection and missing results cannot report success", () => {
    const needs = results(["repo-lint"]);
    needs.select.result = "failure";
    assert.notDeepEqual(failures(needs), []);
    needs.select.result = "success";
    delete needs["repo-lint"];
    assert.notDeepEqual(failures(needs), []);
    needs.select.outputs.jobs = "[]";
    assert.throws(() => failures(needs), /Invalid CI selection/);
});

test("Git errors stop selection", (t) => {
    const { cwd, empty } = repository(t);
    assert.throws(() => select("not-a-revision", empty, cwd));
});
