export interface OpenLegacyInput {
    baseUrl: string;
    authToken: string;
    masterKeyB64: string;
    clientPackage?: string;
    clientVersion?: string;
}

export const openLegacy = async ({
    baseUrl,
    authToken,
    masterKeyB64,
    clientPackage,
    clientVersion,
}: OpenLegacyInput) =>
    (await import("./pkg/ente_legacy_wasm")).openLegacy(
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    );
