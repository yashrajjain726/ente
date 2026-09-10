import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const cargoLints = (source) =>
    execFileSync(
        "python3",
        [
            "-I",
            "-c",
            `
import json, sys, tomllib
cargo = tomllib.loads(sys.stdin.read())
workspace = cargo.get("workspace", {})
selection = {key: sorted(workspace[key]) if key in workspace else None for key in ("members", "exclude", "default-members")}
print(json.dumps([cargo.get("lints"), workspace.get("lints"), selection], sort_keys=True))
`,
        ],
        { encoding: "utf8", input: source },
    );

function rustPolicy(source) {
    const lexer =
        /\/\/[^\n]*|\/\*|[bc]?r(#+)?"[\s\S]*?"\1|[bc]?"(?:\\[\s\S]|[^"\\])*"|b?'(?:\\(?:u\{[\da-fA-F_]+\}|x[\da-fA-F]{2}|[\s\S])|[^'\\\r\n])'|(?:r#)?[a-zA-Z_]\w*|[^\s]/gu;
    const tokens = [];
    let match;
    while ((match = lexer.exec(source))) {
        const token = match[0];
        if (token.startsWith("//")) continue;
        if (token === "/*") {
            const comments = /\/\*|\*\//g;
            comments.lastIndex = lexer.lastIndex;
            for (let depth = 1; depth; ) {
                const comment = comments.exec(source);
                if (!comment) throw new Error("Unclosed Rust comment");
                depth += comment[0] === "/*" ? 1 : -1;
            }
            lexer.lastIndex = comments.lastIndex;
        } else {
            tokens.push(token);
        }
    }
    const pairs = { "(": ")", "[": "]", "{": "}" };
    let cursor = 0;
    const group = (closing) => {
        const nodes = [];
        while (cursor < tokens.length) {
            const token = tokens[cursor++];
            if (token === closing) return nodes;
            if (Object.hasOwn(pairs, token))
                nodes.push([token, ...group(pairs[token]), pairs[token]]);
            else if ([")", "]", "}"].includes(token))
                throw new Error("Unmatched Rust delimiter");
            else nodes.push(token);
        }
        if (closing) throw new Error("Unclosed Rust delimiter");
        return nodes;
    };
    const lint = (nodes) =>
        nodes.some((node, i) =>
            Array.isArray(node)
                ? lint(node)
                : /^(?:r#)?(?:allow|expect|warn|deny|forbid)$/.test(node) &&
                  nodes[i + 1]?.[0] === "(",
        );
    const declarations = [];
    const visit = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] === "#") {
                let end = i;
                let hasLint = false;
                while (nodes[end] === "#") {
                    const bang = nodes[end + 1] === "!";
                    const attribute = nodes[end + (bang ? 2 : 1)];
                    if (!Array.isArray(attribute) || attribute[0] !== "[")
                        break;
                    hasLint ||= lint(attribute);
                    end += bang ? 3 : 2;
                }
                if (hasLint) {
                    let stop = end;
                    if (nodes[i + 1] !== "!") {
                        while (
                            stop < nodes.length &&
                            !["{", ";", ",", "="].includes(
                                Array.isArray(nodes[stop])
                                    ? nodes[stop][0]
                                    : nodes[stop],
                            )
                        )
                            stop++;
                    }
                    declarations.push(JSON.stringify(nodes.slice(i, stop)));
                }
                if (end > i) {
                    i = end - 1;
                    continue;
                }
            }
            if (Array.isArray(nodes[i])) visit(nodes[i].slice(1, -1));
        }
    };
    visit(group());
    return {
        unsafe: tokens.includes("unsafe"),
        declarations: JSON.stringify(declarations.sort()),
    };
}

export function checkRust({ files, readVersions }) {
    return files
        .filter(
            ({ path }) =>
                path.endsWith(".rs") || basename(path) === "Cargo.toml",
        )
        .filter(({ path }) => {
            const { before, after } = readVersions(path);
            if (!path.endsWith(".rs"))
                return cargoLints(before) !== cargoLints(after);
            const oldPolicy = rustPolicy(before);
            const newPolicy = rustPolicy(after);
            return (
                oldPolicy.unsafe ||
                newPolicy.unsafe ||
                oldPolicy.declarations !== newPolicy.declarations
            );
        })
        .map(({ path }) => path);
}
