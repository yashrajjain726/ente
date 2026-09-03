import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";

const [base = "origin/main"] = process.argv.slice(2);

const routineBinary = (file) =>
    /\.(png|jpe?g|webp|gif|ico|icns|ttf|otf|woff2?|riv|mp3)$/i.test(file) || file.includes("Assets.xcassets/");
const guardrailDirs = [
    ".github/",
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
    "eslint.config.mjs",
    ".prettierrc.json",
    "analysis_options.yaml",
]);
const configFile =
    /(^|\/)(\.gitattributes|rust-toolchain\.toml|\.cargo\/(config|audit)\.toml|\.npmrc|\.nvmrc|\.tool-versions|\.node-version|\.python-version|gradle-wrapper\.properties)$/;

const tomlPackages = (text) =>
    text
        .split("[[package]]\n")
        .slice(1)
        .map((block) => ({
            name: block.match(/^name = "(.+)"$/m)[1],
            version: block.match(/^version = "(.+)"$/m)[1],
            source: block.match(/^source = "?(.+?)"?$/m)?.[1]?.replace(/[?#][^"]*/, ""),
        }));
const lockfiles = {
    "Cargo.lock": (text) => tomlPackages(text).map((p) => ({ ...p, source: p.source ?? "workspace", local: !p.source })),
    "uv.lock": (text) => tomlPackages(text).map((p) => ({ ...p, local: !/^\{ (registry|git|url) = /.test(p.source) })),
    "package-lock.json": (text) =>
        Object.entries(JSON.parse(text).packages)
            .filter(([key]) => key.includes("node_modules/"))
            .map(([key, { name, version, resolved, link }]) => {
                const local = link === true || resolved?.startsWith("file:") === true;
                return {
                    name: name ?? key.slice(key.lastIndexOf("node_modules/") + 13),
                    version,
                    source: local || !resolved ? resolved : resolved.replace(/#.*$/, "").replace(/\/-\/[^/]+\.tgz$/, ""),
                    local,
                };
            }),
    "pubspec.lock": (text) =>
        [...text.matchAll(/^  (\S+):\n((?:    .*\n)+)/gm)].map(([, name, body]) => {
            const source = [body.match(/^    source: (.+)$/m)[1], body.match(/^      url: "(.+)"$/m)?.[1]]
                .filter(Boolean)
                .join(" ");
            return { name, version: body.match(/^    version: "(.+)"$/m)[1], source, local: source === "path" };
        }),
    "go.sum": (text) =>
        [...text.matchAll(/^(\S+) (\S+?)(?:\/go\.mod)? h1:/gm)].map(([, name, version]) => ({ name, version })),
    "Package.resolved": (text) =>
        JSON.parse(text).pins.map(({ identity, location, state }) => ({
            name: identity,
            version: state.version,
            source: location,
        })),
    "Podfile.lock": (text) => {
        const section = (title) => text.match(new RegExp(`^${title}:\\n((?:  .*\\n)+)`, "m"))?.[1] ?? "";
        const sources = new Map();
        for (const [, repo, pods] of section("SPEC REPOS").matchAll(/^  (\S+):\n((?:    - .*\n)+)/gm)) {
            for (const [, pod] of pods.matchAll(/^    - (.+)$/gm)) sources.set(pod, { source: repo });
        }
        for (const [, pod, body] of section("EXTERNAL SOURCES").matchAll(/^  (\S+):\n((?:    .*\n)+)/gm)) {
            const props = Object.fromEntries([...body.matchAll(/^    :(\w+): (.+)$/gm)].map(([, key, value]) => [key, value]));
            const source = props.git ?? props.podspec ?? props.path;
            sources.set(pod, { source, local: !props.git && !/^"?https?:\/\//.test(source) });
        }
        return [...section("PODS").matchAll(/^  - "?([^/" ]+)\S* \(([^)]+)\)/gm)].map(([, name, version]) => ({
            name,
            version,
            ...sources.get(name),
        }));
    },
};

const opts = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
const git = (...args) => execFileSync("git", args, opts);
const list = (items) => items.map((item) => `- ${item}`).join("\n");
const code = (file) => `\`${file}\``;
const binary = (file) => {
    const fd = openSync(file, "r");
    const buffer = Buffer.alloc(8000);
    const length = readSync(fd, buffer);
    closeSync(fd);
    return buffer.subarray(0, length).includes(0);
};

const { GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
const local = !GITHUB_OUTPUT;

process.chdir(git("rev-parse", "--show-toplevel").trim());
const mergeBase = git("merge-base", base, "HEAD").trim();
const numstat = (...filter) =>
    git("diff", "--numstat", "--no-renames", "-z", ...filter, mergeBase, ...(local ? [] : ["HEAD"]))
        .split("\0")
        .filter(Boolean)
        .map((row) => row.match(/^([^\t]+)\t([^\t]+)\t(.*)$/s).slice(1));
const untracked = local
    ? git("ls-files", "--others", "--exclude-standard", "-z")
          .split("\0")
          .filter((file) => file && !lstatSync(file).isSymbolicLink())
    : [];
const additions = untracked.map((file) => [binary(file) ? "-" : "0", "0", file]);
const present = [...numstat("--diff-filter=d"), ...additions];
const kept = numstat("--diff-filter=a").map(([, , file]) => file);

const treeSizes = () =>
    git("--literal-pathspecs", "ls-tree", "-l", "-z", "HEAD", "--", ...present.map(([, , file]) => file))
        .split("\0")
        .map((line) => line.match(/ blob \S+ +(\d+)\t(.*)$/s))
        .filter(Boolean)
        .map(([, size, file]) => [file, Number(size)]);
const diskSizes = () =>
    present.flatMap(([, , file]) => {
        const stat = lstatSync(file);
        return stat.isFile() ? [[file, stat.size]] : [];
    });
const sizes = new Map(local ? diskSizes() : present.length ? treeSizes() : []);
const withSize = (file) => `${code(file)} (${sizes.get(file)} bytes)`;

const binaries = present
    .filter(([added, , file]) => added === "-" && !routineBinary(file))
    .map(([, , file]) => withSize(file));
const large = [...numstat("--diff-filter=A"), ...additions]
    .map(([, , file]) => file)
    .filter((file) => sizes.get(file) > 1024 * 1024)
    .map(withSize);

const known = new Map();
for (const file of git("ls-tree", "-r", "--name-only", "-z", mergeBase).split("\0")) {
    const kind = path.basename(file);
    if (!lockfiles[kind]) continue;
    if (!known.has(kind)) known.set(kind, new Map());
    const names = known.get(kind);
    for (const { name, source } of lockfiles[kind](git("show", `${mergeBase}:${file}`))) {
        if (!names.has(name)) names.set(name, new Set());
        names.get(name).add(source);
    }
}
const dependencies = present
    .map(([, , file]) => file)
    .filter((file) => lockfiles[path.basename(file)])
    .flatMap((file) => {
        const before = known.get(path.basename(file)) ?? new Map();
        const after = lockfiles[path.basename(file)](local ? readFileSync(file, "utf8") : git("show", `HEAD:${file}`)).filter(
            ({ local }) => !local,
        );
        const added = new Set(after.filter(({ name }) => !before.has(name)).map(({ name, version }) => `${name} ${version}`));
        const moved = new Set(
            after
                .filter(({ name, source }) => source && before.has(name) && !before.get(name).has(source))
                .map(({ name, source }) => `${name}: ${[...before.get(name)].join(", ")} -> ${source}`),
        );
        return added.size + moved.size ? [{ file, added: [...added], moved: [...moved] }] : [];
    });
const added = dependencies.reduce((n, { added }) => n + added.length, 0);
const moved = dependencies.reduce((n, { moved }) => n + moved.length, 0);

const guardrails = kept.filter(
    (file) => guardrailDirs.some((dir) => file.startsWith(dir)) || guardrailFiles.has(path.basename(file)),
);
const configs = [...numstat(), ...additions].map(([, , file]) => file).filter((file) => configFile.test(file));

const categories = [
    ["binary file", "binary files", binaries.length],
    ["large file", "large files", large.length],
    ["new dependency", "new dependencies", added],
    ["dependency source change", "dependency source changes", moved],
    ["guardrail file", "guardrail files", guardrails.length],
    ["config file", "config files", configs.length],
].filter(([, , n]) => n);
const summary = categories.map(([one, many, n]) => `${n} ${n === 1 ? one : many}`).join(", ");
const detail = [
    binaries.length && `## Binary files\n\n${list(binaries)}`,
    large.length && `## Large files\n\n${list(large)}`,
    dependencies.length &&
        `## New dependencies\n\n${dependencies
            .map(({ file, added, moved }) => `${code(file)}\n\n${list([...added, ...moved])}`)
            .join("\n\n")}`,
    guardrails.length && `## Guardrail changes\n\n${list(guardrails.map(code))}`,
    configs.length && `## Toolchain and registry config\n\n${list(configs.map(code))}`,
]
    .filter(Boolean)
    .join("\n\n");

if (local) {
    if (summary) console.log(`${summary}\n\n${detail}\n`);
    process.exit(0);
}

appendFileSync(GITHUB_OUTPUT, `categories=${JSON.stringify(categories.map(([, many]) => many))}\n`);
if (detail) appendFileSync(GITHUB_STEP_SUMMARY, `${detail}\n`);
