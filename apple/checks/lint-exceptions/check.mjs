import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(
    process.argv[2] ?? resolve(import.meta.dirname, "../../.."),
);
const listPath = "apple/checks/lint-exceptions/suppressions.json";
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
        "apple",
    ],
    { cwd: root, encoding: "utf8" },
).split("\0");

for (const path of new Set(files)) {
    if (!path.endsWith(".swift") || !existsSync(resolve(root, path))) continue;
    const source = readFileSync(resolve(root, path), "utf8");
    for (const { text, start } of comments(source)) {
        const directives =
            /\bswiftlint\s*:\s*disable(?::(?:next|previous|this))?\b([^\r\n]*)|\bswift-format-ignore(-file)?\b([^\r\n]*)/g;
        for (const match of text.matchAll(directives)) {
            const line = source
                .slice(0, start + match.index)
                .split("\n").length;
            const value = (match[1] ?? match[3]).split(/\/\/|\*\//)[0].trim();
            const rules = value
                .replace(/^:\s*/, "")
                .split(/[\s,]+/)
                .filter(Boolean);
            if (match[2] || !rules.length || rules.includes("all")) {
                reject(path, line, "Name the rules being suppressed");
                continue;
            }
            for (const rule of rules) {
                unused.get(path)?.delete(rule);
                if (!allowed[path]?.includes(rule)) {
                    reject(path, line, `${rule} is not listed in ${listPath}`);
                }
            }
        }
    }
}

for (const [path, rules] of unused) {
    for (const rule of rules) {
        reject(
            path,
            1,
            `${rule} has no suppression; remove it from ${listPath}`,
        );
    }
}

function* comments(source) {
    const lexer = /\/\/[^\r\n]*|\/\*|(#*)("""|")/g;
    let match;
    while ((match = lexer.exec(source))) {
        const start = match.index;
        if (match[0].startsWith("//")) {
            yield { text: match[0], start };
        } else if (match[0] === "/*") {
            const markers = /\/\*|\*\//g;
            markers.lastIndex = lexer.lastIndex;
            for (let depth = 1; depth; ) {
                const marker = markers.exec(source);
                if (!marker) throw new Error("Unclosed Swift comment");
                depth += marker[0] === "/*" ? 1 : -1;
            }
            lexer.lastIndex = markers.lastIndex;
            yield { text: source.slice(start, lexer.lastIndex), start };
        } else {
            const end = match[2] + match[1];
            const escape = "\\" + match[1];
            let offset = lexer.lastIndex;
            while (offset < source.length && !source.startsWith(end, offset)) {
                offset += source.startsWith(escape, offset)
                    ? escape.length + 1
                    : 1;
            }
            lexer.lastIndex = offset + end.length;
        }
    }
}

function reject(path, line, message) {
    console.error(`${path}:${line}: ${message}`);
    process.exitCode = 1;
}
