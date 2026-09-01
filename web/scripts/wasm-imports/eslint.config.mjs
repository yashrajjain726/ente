export const rawWasmPath = String.raw`(?:^|/)pkg(?:/|$)|\.wasm(?:[?#].*)?$`;

const selectorRawWasmPath = rawWasmPath.replaceAll("/", "\\u002F");
const payloadImport = `ImportExpression[source.value=/${selectorRawWasmPath}/]`;
const payloadRequire = `CallExpression[callee.name=require][arguments.0.value=/${selectorRawWasmPath}/]`;
const restrictedPayloadRequire = {
    selector: payloadRequire,
    message: "Load generated WASM with import() inside its wrapper.",
};
const exportedPayloadLoader = [
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > ImportExpression",
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > AwaitExpression > ImportExpression",
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > BlockStatement > ReturnStatement > ImportExpression",
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression > BlockStatement > ReturnStatement > AwaitExpression > ImportExpression",
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression > BlockStatement > ReturnStatement > ImportExpression",
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression > BlockStatement > ReturnStatement > AwaitExpression > ImportExpression",
    "ExportNamedDeclaration > FunctionDeclaration > BlockStatement > ReturnStatement > ImportExpression",
    "ExportNamedDeclaration > FunctionDeclaration > BlockStatement > ReturnStatement > AwaitExpression > ImportExpression",
    ":matches(ExportNamedDeclaration, ExportDefaultDeclaration) > ClassDeclaration > ClassBody > PropertyDefinition[static=false]:not([accessibility=private]):not([key.type=PrivateIdentifier]) > ImportExpression",
]
    .map((selector) => `${selector}[source.value=/${selectorRawWasmPath}/]`)
    .join(",");

export default [
    {
        ignores: [
            "**/pkg/**",
            "**/.next*/**",
            "**/dist/**",
            "**/out/**",
            "**/public/**",
            "**/*.d.ts",
            "**/*.test.*",
        ],
    },
    {
        files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            regex: rawWasmPath,
                            allowTypeImports: true,
                            message:
                                "Use an import-safe wrapper that loads generated WASM on demand.",
                        },
                    ],
                },
            ],
            "no-restricted-syntax": [
                "error",
                {
                    selector: payloadImport,
                    message:
                        "Load generated WASM through a wrapper in web/packages/wasm.",
                },
                restrictedPayloadRequire,
            ],
        },
    },
    {
        files: ["packages/wasm/**"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        payloadImport +
                        ":not(:matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) ImportExpression)" +
                        ":not(PropertyDefinition[static=false] > .value)" +
                        ":not(PropertyDefinition[static=false] > .value ImportExpression)",
                    message:
                        "Defer loading generated WASM until an operation needs it.",
                },
                {
                    selector: exportedPayloadLoader,
                    message:
                        "Export operations instead of the generated WASM module.",
                },
                restrictedPayloadRequire,
            ],
        },
    },
];
