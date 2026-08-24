export const openContacts = async (input: unknown) =>
    (await import("./pkg/ente_locker_wasm")).openContacts(input);
