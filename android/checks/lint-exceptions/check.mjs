import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(
    process.argv[2] ?? resolve(import.meta.dirname, "../../.."),
);
const listPath = "android/checks/lint-exceptions/suppressions.json";
const allowed = JSON.parse(readFileSync(resolve(root, listPath), "utf8"));
const unused = new Map(
    Object.entries(allowed).map(([path, rules]) => [path, new Set(rules)]),
);
const files = execFileSync(
    "git",
    [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "android",
    ],
    { cwd: root, encoding: "utf8" },
).split("\0");

for (const path of new Set(files)) {
    if (
        !/\.(?:kt|kts|java|xml)$/.test(path) ||
        !existsSync(resolve(root, path))
    )
        continue;
    const source = readFileSync(resolve(root, path), "utf8");
    const check = (offset, rules) => {
        const line = source.slice(0, offset).split("\n").length;
        if (
            !rules.length ||
            rules.some(
                (rule) =>
                    !/^[\w.:-]+$/.test(rule) || rule.toLowerCase() === "all",
            )
        ) {
            reject(
                path,
                line,
                "Name the rules being suppressed using literal rule IDs",
            );
            return;
        }
        for (const rule of rules) {
            unused.get(path)?.delete(rule);
            if (!allowed[path]?.includes(rule))
                reject(path, line, `${rule} is not listed in ${listPath}`);
        }
    };
    if (path.endsWith(".xml")) {
        const xml = source.replace(
            /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g,
            (text) => " ".repeat(text.length),
        );
        const attributes = [
            ...xml.matchAll(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g),
        ].flatMap((tag) =>
            [...tag[0].matchAll(/([\w.:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(
                (attribute) => ({
                    name: attribute[1],
                    value: attribute[3],
                    start: tag.index + attribute.index,
                }),
            ),
        );
        const prefixes = new Set(["tools"]);
        for (const { name, value } of attributes) {
            if (
                name.startsWith("xmlns:") &&
                value === "http://schemas.android.com/tools"
            ) {
                prefixes.add(name.slice(6));
            }
        }
        for (const { name, value, start } of attributes) {
            const [prefix, local] = name.split(":");
            if (local === "ignore" && prefixes.has(prefix)) {
                check(
                    start,
                    value.split(",").map((rule) => rule.trim()),
                );
            }
        }
        continue;
    }
    const tokens = tokenize(source);
    const names = new Set(["Suppress", "SuppressLint", "SuppressWarnings"]);
    for (let i = 0; i < tokens.length; i++) {
        if (names.has(tokens[i].text) && tokens[i + 1]?.text === "as") {
            names.add(tokens[i + 2]?.text);
        }
    }
    let annotationGroup = false;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let prefix = i - 1;
        while (tokens[prefix]?.text === ".") prefix -= 2;
        if (tokens[prefix]?.text === ":") prefix -= 2;
        const annotated = tokens[prefix]?.text === "@";
        if (token.text === "[" && annotated) annotationGroup = true;
        if (token.text === "]") annotationGroup = false;
        if (token.text.startsWith("//") || token.text.startsWith("/*")) {
            const match = token.text.match(/\bnoinspection\b([^\r\n]*)/);
            if (match)
                check(
                    token.start,
                    match[1]
                        .split("*/")[0]
                        .trim()
                        .split(/[\s,]+/)
                        .filter(Boolean),
                );
        }
        if (
            !(annotated || annotationGroup) ||
            !names.has(token.text) ||
            tokens[i + 1]?.text !== "("
        )
            continue;
        const rules = [];
        let valid = true;
        let depth = 1;
        let j = i + 2;
        for (; j < tokens.length; j++) {
            const value = tokens[j].text;
            if (value === ")" && --depth === 0) break;
            if (value === "(") depth++;
            if (value === "(" || value === ")") continue;
            if (
                value.startsWith("//") ||
                value.startsWith("/*") ||
                /^[,{}\[\]]$/.test(value)
            )
                continue;
            if (
                (value === "names" || value === "value") &&
                tokens[j + 1]?.text === "="
            ) {
                j++;
            } else if (/^"[\w.:-]+"$/.test(value)) {
                rules.push(value.slice(1, -1));
            } else if (value === "arrayOf" && tokens[j + 1]?.text === "(") {
                continue;
            } else {
                valid = false;
            }
        }
        check(token.start, valid && j < tokens.length ? rules : []);
        i = j;
    }
}

for (const [path, rules] of unused) {
    for (const rule of rules)
        reject(
            path,
            1,
            `${rule} has no suppression; remove it from ${listPath}`,
        );
}

function tokenize(source) {
    const lexer =
        /\/\/[^\r\n]*|\/\*|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_]\w*|[^\s]/g;
    const tokens = [];
    let match;
    while ((match = lexer.exec(source))) {
        const start = match.index;
        if (match[0] === "/*") {
            const markers = /\/\*|\*\//g;
            markers.lastIndex = lexer.lastIndex;
            for (let depth = 1; depth; ) {
                const marker = markers.exec(source);
                if (!marker) throw new Error("Unclosed Android comment");
                depth += marker[0] === "/*" ? 1 : -1;
            }
            lexer.lastIndex = markers.lastIndex;
        }
        tokens.push({ text: source.slice(start, lexer.lastIndex), start });
    }
    return tokens;
}

function reject(path, line, message) {
    console.error(`${path}:${line}: ${message}`);
    process.exitCode = 1;
}
