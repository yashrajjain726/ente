export const openLegacy = async (input: unknown) =>
    (await import("./pkg/ente_legacy_wasm")).openLegacy(input);
