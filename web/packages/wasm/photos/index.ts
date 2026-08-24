export const openContacts = async (input: unknown) =>
    (await import("./pkg/ente_photos_wasm")).openContacts(input);
