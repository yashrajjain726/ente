import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { rustFunctionExports, unusedExports } from "./exports.mjs";

test("production references cross lazy loaders, aliases, destructuring and workers", () => {
    const directory = mkdtempSync(join(tmpdir(), "wasm-exports-"));
    const file = (name, contents) => {
        const path = join(directory, name);
        writeFileSync(path, contents);
        return path;
    };
    try {
        const bindings = file(
            "raw.d.ts",
            `
            export function used(): void;
            export function destructured(): void;
            export function aliased(): void;
            export function indexed(): void;
            export function workerOnly(): void;
            export function orphan(): void;
            export function testOnly(): void;
            export function typeOnly(): void;
            export function wrapperOnly(): void;
            export function start(): void;
        `,
        );
        const wrapper = file(
            "wrapper.ts",
            `
            const wasm = () => import("./raw");
            export const run = async () => {
                (await wasm()).used();
                const { destructured: read } = await wasm();
                read();
                (await wasm())["indexed"]();
            };
            export const unusedForwarder = async () => (await wasm()).wrapperOnly();
        `,
        );
        const entry = file(
            "entry.ts",
            `
            import { run as execute } from "./wrapper";
            import { aliased as action } from "./raw";
            execute();
            action();
            type Signature = typeof import("./raw").typeOnly;
            new Worker(new URL("./worker.ts", import.meta.url));
        `,
        );
        file("worker.ts", `import { workerOnly } from "./raw"; workerOnly();`);
        file("unused.ts", `import { orphan } from "./raw"; orphan();`);
        file(
            "binding.test.ts",
            `import { testOnly } from "./raw"; testOnly();`,
        );
        const projects = [
            {
                entryFiles: [entry],
                options: {
                    module: ts.ModuleKind.ESNext,
                    moduleResolution: ts.ModuleResolutionKind.Bundler,
                },
            },
        ];
        const check = () =>
            unusedExports([bindings, wrapper], projects)
                .map(({ name }) => name)
                .sort();
        assert.deepEqual(check(), [
            "orphan",
            "testOnly",
            "typeOnly",
            "unusedForwarder",
        ]);

        file(
            "wrapper.ts",
            `export const run = async () => {
            const wasm = await import("./raw");
            wasm.used(); wasm.destructured(); wasm.indexed();
        };`,
        );
        assert.deepEqual(check(), [
            "orphan",
            "testOnly",
            "typeOnly",
            "wrapperOnly",
        ]);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("copies of a Rust export need one caller across artifacts", () => {
    const directory = mkdtempSync(join(tmpdir(), "wasm-export-origins-"));
    const file = (name, contents) => {
        const path = join(directory, name);
        writeFileSync(path, contents);
        return path;
    };
    try {
        const shared = file(
            "shared.rs",
            `
#[wasm_bindgen(js_name = sharedOperation)]
pub fn shared_operation() {}

pub fn internal_helper() {}
`,
        );
        const appSource = (app) =>
            file(
                `${app}.rs`,
                `
#[wasm_bindgen(js_name = localOperation)]
pub fn local_operation() {}
`,
            );
        const leftSource = appSource("left");
        const rightSource = appSource("right");
        const declarations = `
            export function sharedOperation(): void;
            export function localOperation(): void;
        `;
        const left = file("left.d.ts", declarations);
        const right = file("right.d.ts", declarations);
        const origins = new Map([
            [left, rustFunctionExports([shared, leftSource])],
            [right, rustFunctionExports([shared, rightSource])],
        ]);
        const entry = file(
            "entry.ts",
            `
            import { sharedOperation, localOperation } from "./left";
            sharedOperation();
            localOperation();
        `,
        );
        file(
            "right.test.ts",
            `import { localOperation } from "./right"; localOperation();`,
        );
        const check = () =>
            unusedExports(
                [left, right],
                [
                    {
                        entryFiles: [entry],
                        options: {
                            module: ts.ModuleKind.ESNext,
                            moduleResolution: ts.ModuleResolutionKind.Bundler,
                        },
                    },
                ],
                origins,
            ).map(({ file, name }) => ({ file, name }));

        assert.deepEqual(check(), [
            { file: rightSource, name: "localOperation" },
        ]);

        file(
            "entry.ts",
            `import { localOperation } from "./left"; localOperation();`,
        );
        file(
            "shared.test.ts",
            `import { sharedOperation } from "./right"; sharedOperation();`,
        );
        assert.deepEqual(check(), [
            { file: shared, name: "sharedOperation" },
            { file: rightSource, name: "localOperation" },
        ]);

        file("right.d.ts", declarations + "export function unmapped(): void;");
        assert.throws(check, /cannot locate Rust export unmapped/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
