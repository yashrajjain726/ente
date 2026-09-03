import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const script = join(import.meta.dirname, "change-approval.mjs");
const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.com",
};

const scan = (t, base, change, { commit: committed = true, gitlink, symlink, ci = false } = {}) => {
    const repo = mkdtempSync(join(tmpdir(), "change-approval-"));
    t.after(() => rmSync(repo, { recursive: true }));
    const git = (...args) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
    const write = (files) => {
        for (const [file, content] of Object.entries(files)) {
            if (content === null) {
                rmSync(join(repo, file));
            } else {
                mkdirSync(join(repo, dirname(file)), { recursive: true });
                writeFileSync(join(repo, file), content);
            }
        }
    };
    const commit = (revision) => {
        git("add", "-A");
        if (gitlink) git("update-index", "--add", "--cacheinfo", `160000,${String(revision).repeat(40)},${gitlink}`);
        git("commit", "-q", "--allow-empty", "-m", "change");
        return git("rev-parse", "HEAD").trim();
    };
    git("init", "-q", "-b", "main");
    write(base);
    const sha = commit(1);
    write(change);
    if (symlink) symlinkSync("missing-target", join(repo, symlink));
    if (committed) commit(2);
    const outputs = ci ? { GITHUB_OUTPUT: join(repo, ".output"), GITHUB_STEP_SUMMARY: join(repo, ".summary") } : {};
    const stdout = execFileSync(process.execPath, [script, sha], { cwd: repo, env: { ...env, ...outputs }, encoding: "utf8" });
    const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
    return ci ? { stdout, output: read(outputs.GITHUB_OUTPUT), summary: read(outputs.GITHUB_STEP_SUMMARY) } : stdout;
};

const registry = "registry+https://github.com/rust-lang/crates.io-index";
const cargo = (packages) =>
    packages
        .map(
            ([name, version, source = registry]) =>
                `[[package]]\nname = "${name}"\nversion = "${version}"\n${source ? `source = "${source}"\n` : ""}`,
        )
        .join("\n");
const npm = (packages) => JSON.stringify({ packages: { "": {}, ...packages } });
const tarball = (name, version, host = "registry.npmjs.org") => ({
    version,
    resolved: `https://${host}/${name}/-/${name}-${version}.tgz`,
});
const pub = (packages) =>
    `packages:\n${packages
        .map(
            ([name, version, source = "hosted"]) =>
                `  ${name}:\n    dependency: transitive\n    description:\n${
                    source === "path"
                        ? `      path: "../${name}"\n      relative: true\n`
                        : `      name: ${name}\n      url: "https://pub.dev"\n`
                }    source: ${source}\n    version: "${version}"\n`,
        )
        .join("")}sdks:\n  dart: ">=3.0.0 <4.0.0"\n`;
const gosum = (modules) =>
    modules.map(([name, version]) => `${name} ${version} h1:x=\n${name} ${version}/go.mod h1:y=\n`).join("");
const pins = (entries) =>
    JSON.stringify({
        pins: entries.map(([identity, version]) => ({
            identity,
            location: `https://github.com/x/${identity}.git`,
            state: { version },
        })),
    });
const podfile = ({ pods, repos = {}, external = {} }) =>
    `PODS:\n${pods.map((spec) => `  - ${spec}\n`).join("")}\nSPEC REPOS:\n${Object.entries(repos)
        .map(([repo, names]) => `  ${repo}:\n${names.map((name) => `    - ${name}\n`).join("")}`)
        .join("")}\nEXTERNAL SOURCES:\n${Object.entries(external)
        .map(([name, props]) => `  ${name}:\n${Object.entries(props).map(([key, value]) => `    :${key}: ${value}\n`).join("")}`)
        .join("")}\nCOCOAPODS: 1.17.0\n`;
const uv = (entries) =>
    entries
        .map(([name, version, source = '{ registry = "https://pypi.org/simple" }']) => `[[package]]\nname = "${name}"\nversion = "${version}"\nsource = ${source}\n`)
        .join("\n");

test("binary added", (t) => {
    const output = scan(t, {}, { "a.bin": Buffer.alloc(16) });
    assert.equal(output, "1 binary file\n\n## Binary files\n\n- `a.bin` (16 bytes)\n\n");
});

test("binary modified", (t) => {
    const output = scan(t, { "a.bin": Buffer.alloc(16) }, { "a.bin": Buffer.alloc(32) });
    assert.match(output, /^1 binary file\n/);
    assert.match(output, /`a.bin` \(32 bytes\)/);
});

test("binary deleted is ignored", (t) => {
    assert.equal(scan(t, { "a.bin": Buffer.alloc(16) }, { "a.bin": null }), "");
});

test("CI preserves tabs and newlines in binary and large filenames", (t) => {
    const binary = "image.png\tpayload.jar";
    const large = "large\nfile.txt";
    const size = 1024 * 1024 + 1;
    const { output, summary } = scan(t, {}, { [binary]: Buffer.alloc(16), [large]: "a".repeat(size) }, { ci: true });
    assert.equal(output, 'categories=["binary files","large files"]\n');
    assert.equal(summary, `## Binary files\n\n- \`${binary}\` (16 bytes)\n\n## Large files\n\n- \`${large}\` (${size} bytes)\n`);
});

test("routine image, font, and xcassets binaries are ignored", (t) => {
    const output = scan(t, {}, {
        "src/logo.PNG": Buffer.alloc(16),
        "web/fonts/a.woff2": Buffer.alloc(16),
        "ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents": Buffer.alloc(16),
    });
    assert.equal(output, "");
});

test("large files added, binary or text, not grown", (t) => {
    const size = 1024 * 1024 + 1;
    const output = scan(
        t,
        { "big.txt": "a" },
        { "big.txt": "a".repeat(size), "big.bin": Buffer.alloc(size), "new.txt": "b".repeat(size) },
    );
    assert.equal(
        output,
        `1 binary file, 2 large files\n\n## Binary files\n\n- \`big.bin\` (${size} bytes)\n\n## Large files\n\n- \`big.bin\` (${size} bytes)\n- \`new.txt\` (${size} bytes)\n\n`,
    );
});

test("Cargo.lock new package, not version bump", (t) => {
    const output = scan(
        t,
        { "rust/Cargo.lock": cargo([["a", "1.0.0"], ["b", "1.0.0"]]) },
        { "rust/Cargo.lock": cargo([["a", "1.1.0"], ["b", "1.0.0"], ["c", "2.0.0"]]) },
    );
    assert.equal(output, "1 new dependency\n\n## New dependencies\n\n`rust/Cargo.lock`\n\n- c 2.0.0\n\n");
});

test("workspace-local packages are not dependencies", (t) => {
    const output = scan(
        t,
        { "Cargo.lock": cargo([["a", "1.0.0"]]), "pubspec.lock": pub([["a", "1.0.0"]]), "package-lock.json": npm({}) },
        {
            "Cargo.lock": cargo([["a", "1.0.0"], ["member", "0.0.0", ""]]),
            "pubspec.lock": pub([["a", "1.0.0"], ["local", "0.0.1", "path"]]),
            "package-lock.json": npm({ "node_modules/w": { resolved: "apps/w", link: true } }),
        },
    );
    assert.equal(output, "");
});

test("dependency source change, even beside the original version", (t) => {
    const fork = "git+https://github.com/x/a";
    const output = scan(
        t,
        { "package-lock.json": npm({ "node_modules/y": tarball("y", "1.0.0") }), "rust/Cargo.lock": cargo([["a", "1.0.0"]]) },
        {
            "package-lock.json": npm({ "node_modules/y": tarball("y", "1.0.0", "npm.example.com") }),
            "rust/Cargo.lock": cargo([["a", "1.0.0"], ["a", "1.1.0", fork]]),
        },
    );
    assert.equal(
        output,
        `2 dependency source changes\n\n## New dependencies\n\n\`package-lock.json\`\n\n- y: https://registry.npmjs.org/y -> https://npm.example.com/y\n\n\`rust/Cargo.lock\`\n\n- a: ${registry} -> ${fork}\n\n`,
    );
});

test("git rev bump keeps the source, repository change does not", (t) => {
    const at = (repo, rev) => `git+${repo}?rev=${rev}#${rev}`;
    const output = scan(
        t,
        {
            "rust/Cargo.lock": cargo([["h", "0.2.0", at("https://github.com/ente/heic-decoder.git", "aaa")], ["r", "1.0.0", at("https://github.com/a/r.git", "x")]]),
            "uv.lock": uv([["u", "1.0.0", '{ git = "https://github.com/x/u?rev=1#1" }']]),
        },
        {
            "rust/Cargo.lock": cargo([["h", "0.2.0", at("https://github.com/ente/heic-decoder.git", "bbb")], ["r", "1.0.0", at("https://github.com/b/r.git", "x")]]),
            "uv.lock": uv([["u", "1.0.0", '{ git = "https://github.com/x/u?rev=2#2" }']]),
        },
    );
    assert.equal(
        output,
        "1 dependency source change\n\n## New dependencies\n\n`rust/Cargo.lock`\n\n- r: git+https://github.com/a/r.git -> git+https://github.com/b/r.git\n\n",
    );
});

test("package-lock.json new nested package", (t) => {
    const output = scan(
        t,
        { "package-lock.json": npm({ "node_modules/x": tarball("x", "1.0.0") }) },
        {
            "package-lock.json": npm({
                "node_modules/x": tarball("x", "1.0.1"),
                "node_modules/x/node_modules/@s/y": tarball("y", "2.0.0"),
            }),
        },
    );
    assert.match(output, /^1 new dependency\n/);
    assert.match(output, /- @s\/y 2\.0\.0\n/);
});

test("pubspec.lock new package", (t) => {
    const output = scan(t, { "pubspec.lock": pub([["a", "1.0.0"]]) }, { "pubspec.lock": pub([["a", "1.0.0"], ["b", "3.1.4"]]) });
    assert.match(output, /^1 new dependency\n/);
    assert.match(output, /- b 3\.1\.4\n/);
});

test("Package.resolved, Podfile.lock, and uv.lock new packages", (t) => {
    const output = scan(
        t,
        {
            "Package.resolved": pins([["a", "1.0.0"]]),
            "Podfile.lock": podfile({ pods: ["A/Core (1.0.0)"], repos: { trunk: ["A"] } }),
            "uv.lock": uv([["a", "1.0.0"]]),
        },
        {
            "Package.resolved": pins([["a", "1.0.0"], ["b", "2.0.0"]]),
            "Podfile.lock": podfile({
                pods: ["A/Core (1.0.0)", "A/Extra (1.0.0)", '"B/Sub+x (3.0.0)"'],
                repos: { trunk: ["A", "B"] },
            }),
            "uv.lock": uv([["a", "1.0.0"], ["c", "4.0.0"], ["me", "0.0.0", '{ virtual = "." }']]),
        },
    );
    assert.equal(
        output,
        "3 new dependencies\n\n## New dependencies\n\n`Package.resolved`\n\n- b 2.0.0\n\n`Podfile.lock`\n\n- B 3.0.0\n\n`uv.lock`\n\n- c 4.0.0\n\n",
    );
});

test("Podfile.lock pod moving from a spec repo to git is a source change", (t) => {
    const output = scan(
        t,
        { "ios/Podfile.lock": podfile({ pods: ["Sentry (8.0.0)"], repos: { trunk: ["Sentry"] } }) },
        {
            "ios/Podfile.lock": podfile({
                pods: ["Sentry (8.0.0)"],
                external: { Sentry: { branch: "main", git: "https://github.com/x/sentry-cocoa.git" } },
            }),
        },
    );
    assert.equal(
        output,
        "1 dependency source change\n\n## New dependencies\n\n`ios/Podfile.lock`\n\n- Sentry: trunk -> https://github.com/x/sentry-cocoa.git\n\n",
    );
});

test("local path packages are not dependencies until they leave the tree", (t) => {
    const output = scan(
        t,
        { "ios/Podfile.lock": podfile({ pods: ["A (1.0.0)"], repos: { trunk: ["A"] } }), "uv.lock": uv([["b", "1.0.0", '{ directory = "../b" }']]) },
        {
            "ios/Podfile.lock": podfile({
                pods: ["A (1.0.0)", "Local (1.0.0)"],
                repos: { trunk: ["A"] },
                external: { Local: { path: '"../Local"' } },
            }),
            "uv.lock": uv([["b", "1.0.0"], ["c", "2.0.0", '{ directory = "../c" }'], ["d", "3.0.0", '{ editable = "." }']]),
        },
    );
    assert.equal(
        output,
        '1 dependency source change\n\n## New dependencies\n\n`uv.lock`\n\n- b: { directory = "../b" } -> { registry = "https://pypi.org/simple" }\n\n',
    );
});

test("npm alias of a present package is not new", (t) => {
    const output = scan(
        t,
        { "package-lock.json": npm({ "node_modules/react": tarball("react", "18.3.1") }) },
        {
            "package-lock.json": npm({
                "node_modules/react": tarball("react", "18.3.1"),
                "node_modules/react-alias": { name: "react", ...tarball("react", "18.3.1") },
            }),
        },
    );
    assert.equal(output, "");
});

test("bundled npm entry without resolved is new by name only", (t) => {
    const output = scan(
        t,
        { "package-lock.json": npm({ "node_modules/x": tarball("x", "1.0.0") }) },
        {
            "package-lock.json": npm({
                "node_modules/x": tarball("x", "1.0.1"),
                "node_modules/x/node_modules/y": { version: "1.0.0", inBundle: true },
            }),
        },
    );
    assert.equal(output, "1 new dependency\n\n## New dependencies\n\n`package-lock.json`\n\n- y 1.0.0\n\n");
});

test("npm file: entry is local until it moves to the registry", (t) => {
    const output = scan(
        t,
        { "package-lock.json": npm({ "node_modules/x": { version: "1.0.0", resolved: "file:vendor/x-1.0.0.tgz" } }) },
        {
            "package-lock.json": npm({
                "node_modules/x": tarball("x", "1.0.0"),
                "node_modules/z": { version: "2.0.0", resolved: "file:vendor/z-2.0.0.tgz" },
            }),
        },
    );
    assert.equal(
        output,
        "1 dependency source change\n\n## New dependencies\n\n`package-lock.json`\n\n- x: file:vendor/x-1.0.0.tgz -> https://registry.npmjs.org/x\n\n",
    );
});

test("go.sum new module", (t) => {
    const output = scan(
        t,
        { "go.sum": gosum([["a.com/x", "v1.0.0"]]) },
        { "go.sum": gosum([["a.com/x", "v1.2.0"], ["b.org/y/v2", "v2.0.1"]]) },
    );
    assert.match(output, /^1 new dependency\n/);
    assert.match(output, /- b\.org\/y\/v2 v2\.0\.1\n/);
});

test("guardrail paths modified or deleted, not added", (t) => {
    const output = scan(
        t,
        { ".github/scripts/x.mjs": "", ".github/workflows/x.yml": "on: push\n", "web/apps/x/eslint.config.mjs": "" },
        {
            ".github/scripts/x.mjs": "export {};\n",
            ".github/workflows/x.yml": "on: pull_request\n",
            "web/apps/x/eslint.config.mjs": null,
            ".github/CODEOWNERS": "",
        },
    );
    assert.equal(
        output,
        "3 guardrail files\n\n## Guardrail changes\n\n- `.github/scripts/x.mjs`\n- `.github/workflows/x.yml`\n- `web/apps/x/eslint.config.mjs`\n\n",
    );
});

test("toolchain and registry config added, modified, or deleted", (t) => {
    const output = scan(
        t,
        { "web/.npmrc": "", "rust/.cargo/config.toml": "" },
        { "web/.npmrc": "registry=https://example.com\n", "rust/.cargo/config.toml": null, ".nvmrc": "24\n" },
    );
    assert.equal(
        output,
        "3 config files\n\n## Toolchain and registry config\n\n- `.nvmrc`\n- `rust/.cargo/config.toml`\n- `web/.npmrc`\n\n",
    );
});

test("new root .cargo/config.toml is a config file, even untracked", (t) => {
    const expected = "1 config file\n\n## Toolchain and registry config\n\n- `.cargo/config.toml`\n\n";
    assert.equal(scan(t, { "a.txt": "a\n" }, { ".cargo/config.toml": "[registries]\n" }), expected);
    assert.equal(scan(t, { "a.txt": "a\n" }, { ".cargo/config.toml": "[registries]\n" }, { commit: false }), expected);
});

test("Git attributes require config approval even when they hide binary changes", (t) => {
    const { output, summary } = scan(
        t,
        { "modified/.gitattributes": "", "deleted/.gitattributes": "", "a.jar": Buffer.alloc(16) },
        {
            ".gitattributes": "*.jar diff\n",
            "added/.gitattributes": "*.jar diff\n",
            "modified/.gitattributes": "*.jar diff\n",
            "deleted/.gitattributes": null,
            "a.jar": Buffer.alloc(32),
        },
        { ci: true },
    );
    assert.equal(output, 'categories=["config files"]\n');
    assert.equal(summary, "## Toolchain and registry config\n\n- `.gitattributes`\n- `added/.gitattributes`\n- `deleted/.gitattributes`\n- `modified/.gitattributes`\n");
});

test("uncommitted and untracked changes are scanned locally", (t) => {
    const output = scan(
        t,
        { "a.bin": Buffer.alloc(16) },
        { "a.bin": Buffer.alloc(32), "rust/Cargo.lock": cargo([["a", "1.0.0"]]) },
        { commit: false },
    );
    assert.equal(
        output,
        "1 binary file, 1 new dependency\n\n## Binary files\n\n- `a.bin` (32 bytes)\n\n## New dependencies\n\n`rust/Cargo.lock`\n\n- a 1.0.0\n\n",
    );
});

test("CI mode writes categories and the step summary, and tolerates gitlinks", (t) => {
    const { stdout, output, summary } = scan(t, { "a.txt": "a\n" }, { "a.bin": Buffer.alloc(16) }, { gitlink: "sub", ci: true });
    assert.equal(stdout, "");
    assert.equal(output, 'categories=["binary files"]\n');
    assert.equal(summary, "## Binary files\n\n- `a.bin` (16 bytes)\n");
});

test("untracked dangling symlink is skipped locally", (t) => {
    const output = scan(t, { "a.txt": "a\n" }, { "a.bin": Buffer.alloc(16) }, { commit: false, symlink: "link" });
    assert.equal(output, "1 binary file\n\n## Binary files\n\n- `a.bin` (16 bytes)\n\n");
});

test("CI mode with nothing flagged", (t) => {
    const { stdout, output, summary } = scan(t, { "a.txt": "a\n" }, { "a.txt": "b\n" }, { ci: true });
    assert.equal(stdout, "");
    assert.equal(output, "categories=[]\n");
    assert.equal(summary, "");
});

test("ordinary change is silent", (t) => {
    assert.equal(scan(t, { "src/a.txt": "a\n" }, { "src/a.txt": "b\n", "src/b.txt": "c\n" }), "");
});
