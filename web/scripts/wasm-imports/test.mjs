import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const dependencies = resolve(import.meta.dirname, "../../node_modules");
const eslint = [
    join(dependencies, "eslint/bin/eslint.js"),
    "--config",
    join(import.meta.dirname, "eslint.config.mjs"),
    "--parser",
    "@typescript-eslint/parser",
    "--no-inline-config",
    "--max-warnings",
    "0",
    "apps",
    "packages",
];
const entrypoints = [join(import.meta.dirname, "entrypoints.mjs")];

test("WASM inner boundary", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "ente-wasm-check-"));
    t.after(() => rmSync(root, { recursive: true }));
    const web = join(root, "web");
    const wrapper = join(web, "packages/wasm/new-package");
    mkdirSync(wrapper, { recursive: true });
    mkdirSync(join(web, "apps"));
    symlinkSync(dependencies, join(web, "node_modules"), "dir");

    const cases = [
        ["new package, static caller, and type exports", {}],
        [
            "public raw module loader",
            {
                source: 'export const loadWasm = () => import("./pkg/arbitrary-name");',
                error: "no-restricted-syntax",
            },
        ],
        [
            "block-bodied public raw module loader",
            {
                source: 'export const loadWasm = () => { return import("./pkg/arbitrary-name"); };',
                error: "no-restricted-syntax",
            },
        ],
        [
            "arrow operation with a private nested loader",
            {
                source: [
                    "export const operation = () => {",
                    '    const wasm = () => import("./pkg/arbitrary-name");',
                    "    return wasm().then((module) => module.operation());",
                    "};",
                ].join("\n"),
            },
        ],
        [
            "function operation with a private nested loader",
            {
                source: [
                    "export function operation() {",
                    '    function wasm() { return import("./pkg/arbitrary-name"); }',
                    "    return wasm().then((module) => module.operation());",
                    "}",
                ].join("\n"),
            },
        ],
        [
            "eager dynamic import",
            {
                source: 'export const wasm = import("./pkg/arbitrary-name");',
                error: "no-restricted-syntax",
            },
        ],
        [
            "static payload import",
            {
                source: 'import * as wasm from "./pkg/arbitrary-name";',
                error: "no-restricted-imports",
            },
        ],
        [
            "CommonJS payload import",
            {
                source: 'const wasm = require("./pkg/arbitrary-name");',
                error: "no-restricted-syntax",
            },
        ],
        [
            "raw binding re-export",
            {
                source: 'export * from "./pkg/arbitrary-name";',
                error: "no-restricted-imports",
            },
        ],
        [
            "inline suppression cannot disable the check",
            {
                source: '/* eslint-disable no-restricted-imports */\nexport * from "./pkg/arbitrary-name";',
                error: "no-restricted-imports",
            },
        ],
        [
            "app bypasses the wrapper",
            {
                caller: 'export const bypass = () => import("../packages/wasm/new-package/pkg/arbitrary-name");',
                error: "no-restricted-syntax",
            },
        ],
        [
            "app imports a WASM payload",
            {
                caller: 'export const bypass = () => import("../packages/wasm/new-package/arbitrary.wasm?url");',
                error: "no-restricted-syntax",
            },
        ],
        [
            "private lazy instance initialization",
            {
                source: 'export class Client { #wasm = import("./pkg/arbitrary-name"); }',
            },
        ],
        [
            "public raw module field",
            {
                source: 'export class Client { wasm = import("./pkg/arbitrary-name"); }',
                error: "no-restricted-syntax",
            },
        ],
        [
            "eager static initialization",
            {
                source: 'export class Client { static wasm = import("./pkg/arbitrary-name"); }',
                error: "no-restricted-syntax",
            },
        ],
        [
            "runtime manifest entry bypass",
            {
                manifest: { module: "./arbitrary.wasm" },
                error: "bypasses the wrapper",
            },
        ],
        [
            "conditional subpath bypass",
            {
                manifest: {
                    exports: {
                        "./raw": {
                            browser: { import: "./pkg/arbitrary-name.js" },
                        },
                    },
                },
                error: "bypasses the wrapper",
            },
        ],
    ];
    for (const [name, { source, caller, manifest, error }] of cases) {
        await t.test(name, () => {
            writeFileSync(
                join(wrapper, "index.ts"),
                source ??
                    [
                        'export type { Result } from "./pkg/arbitrary-name";',
                        'const wasm = () => import("./pkg/arbitrary-name");',
                        "export const operation = async () => (await wasm()).operation();",
                    ].join("\n"),
            );
            writeFileSync(
                join(web, "apps/consumer.ts"),
                caller ?? 'import "../packages/wasm/new-package/index";',
            );
            writeFileSync(
                join(wrapper, "package.json"),
                JSON.stringify({
                    name: "unlisted-wasm-package",
                    module: "./index.ts",
                    exports: {
                        ".": {
                            types: "./pkg/arbitrary-name.d.ts",
                            import: "./index.ts",
                        },
                    },
                    ...manifest,
                }),
            );
            for (const [args, expected] of [
                [eslint, manifest ? undefined : error],
                [entrypoints, manifest ? error : undefined],
            ]) {
                const result = spawnSync(process.execPath, args, {
                    cwd: web,
                    encoding: "utf8",
                });
                const output = result.stdout + result.stderr;
                assert.equal(result.status, expected ? 1 : 0, output);
                if (expected) assert.match(output, new RegExp(expected));
            }
        });
    }
});
