import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const isProductionSource = (source) =>
    !source.isDeclarationFile &&
    !/\/(node_modules|tests|__tests__)\/|\.(test|spec)\.[^/]+$/.test(
        source.fileName,
    );

const declarationKey = (node) => `${node.getSourceFile().fileName}:${node.pos}`;

export function rustFunctionExports(files) {
    const exports = new Map();
    for (const file of files) {
        const source = readFileSync(file, "utf8");
        const declaration =
            /^#\[wasm_bindgen(?:\(([^)]*)\))?\]\s*pub (?:async )?fn (\w+)/gm;
        for (const match of source.matchAll(declaration)) {
            const name =
                /js_name\s*=\s*"?(\w+)/.exec(match[1] ?? "")?.[1] ?? match[2];
            if (exports.has(name))
                throw new Error(`Duplicate Rust WASM export: ${name}`);
            exports.set(name, {
                file,
                name,
                line: source.slice(0, match.index).split("\n").length,
            });
        }
    }
    return exports;
}

export function unusedExports(files, projects, rustOrigins = new Map()) {
    const candidates = new Map();
    for (const file of files) {
        const source = ts.createSourceFile(
            file,
            readFileSync(file, "utf8"),
            ts.ScriptTarget.Latest,
            true,
        );
        const add = (node) => {
            if (
                !node.name ||
                (source.isDeclarationFile && node.name.getText() === "start")
            )
                return;
            if (
                ts.isObjectBindingPattern(node.name) ||
                ts.isArrayBindingPattern(node.name)
            ) {
                for (const element of node.name.elements) add(element);
                return;
            }
            const name = node.name.getText();
            const origin = rustOrigins.get(file)?.get(name);
            if (source.isDeclarationFile && rustOrigins.has(file) && !origin) {
                throw new Error(`${file}: cannot locate Rust export ${name}`);
            }
            candidates.set(declarationKey(node), {
                key: origin ? `${origin.file}:${name}` : declarationKey(node),
                file: origin?.file ?? file,
                name,
                line:
                    origin?.line ??
                    source.getLineAndCharacterOfPosition(node.getStart()).line +
                        1,
            });
        };
        for (const node of source.statements) {
            if (
                !node.modifiers?.some(
                    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
                )
            )
                continue;
            if (ts.isFunctionDeclaration(node)) add(node);
            if (ts.isClassDeclaration(node) && !source.isDeclarationFile)
                add(node);
            if (ts.isVariableStatement(node)) {
                for (const declaration of node.declarationList.declarations)
                    add(declaration);
            }
        }
    }

    const used = new Set();
    for (const { entryFiles, options } of projects) {
        const program = withWorkers(entryFiles, options);
        const checker = program.getTypeChecker();
        const reference = (symbol) => {
            if (!symbol) return;
            if (symbol.flags & ts.SymbolFlags.Alias)
                symbol = checker.getAliasedSymbol(symbol);
            for (const root of checker.getRootSymbols(symbol)) {
                for (const declaration of root.declarations ?? []) {
                    const candidate = candidates.get(
                        declarationKey(declaration),
                    );
                    if (candidate) used.add(candidate.key);
                }
            }
        };
        for (const source of program.getSourceFiles()) {
            if (!isProductionSource(source)) continue;
            const visit = (node) => {
                if (
                    ts.isImportDeclaration(node) ||
                    ts.isExportDeclaration(node) ||
                    ts.isTypeNode(node)
                )
                    return;
                if (
                    ts.isBindingElement(node) &&
                    ts.isObjectBindingPattern(node.parent)
                ) {
                    const name = node.propertyName ?? node.name;
                    reference(
                        checker.getPropertyOfType(
                            checker.getTypeAtLocation(node.parent),
                            name.getText(),
                        ),
                    );
                } else if (ts.isShorthandPropertyAssignment(node)) {
                    reference(checker.getShorthandAssignmentValueSymbol(node));
                } else if (
                    ts.isIdentifier(node) &&
                    (node.parent.name !== node ||
                        ts.isPropertyAccessExpression(node.parent))
                ) {
                    reference(checker.getSymbolAtLocation(node));
                } else if (
                    ts.isElementAccessExpression(node) &&
                    ts.isStringLiteral(node.argumentExpression)
                ) {
                    reference(
                        checker.getPropertyOfType(
                            checker.getTypeAtLocation(node.expression),
                            node.argumentExpression.text,
                        ),
                    );
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }
    }
    return [
        ...new Map(
            [...candidates.values()]
                .filter(({ key }) => !used.has(key))
                .map(({ key, ...candidate }) => [key, candidate]),
        ).values(),
    ];
}

function withWorkers(entryFiles, options) {
    const roots = new Set(entryFiles);
    let program;
    for (;;) {
        program = ts.createProgram([...roots], options, undefined, program);
        const previousSize = roots.size;
        for (const source of program.getSourceFiles()) {
            if (!isProductionSource(source)) continue;
            const visit = (node) => {
                if (
                    ts.isNewExpression(node) &&
                    node.expression.getText(source) === "URL" &&
                    node.arguments?.[0] &&
                    ts.isStringLiteral(node.arguments[0])
                ) {
                    const file = resolve(
                        dirname(source.fileName),
                        node.arguments[0].text,
                    );
                    if (/\.[jt]sx?$/.test(file) && existsSync(file))
                        roots.add(file);
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }
        if (roots.size === previousSize) return program;
    }
}
