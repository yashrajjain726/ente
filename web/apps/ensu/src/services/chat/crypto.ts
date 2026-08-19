import { ensuCrypto, type EncryptedChatPayload } from "../wasm";

export type { EncryptedChatPayload } from "../wasm";

export const encryptChatPayload = async (
    payload: unknown,
    chatKeyB64: string,
): Promise<EncryptedChatPayload> =>
    (await ensuCrypto()).encryptPayload(JSON.stringify(payload), chatKeyB64);

export const decryptChatPayload = async (
    { encryptedData, header }: EncryptedChatPayload,
    chatKeyB64: string,
): Promise<unknown> =>
    JSON.parse(
        await (
            await ensuCrypto()
        ).decryptPayload(encryptedData, header, chatKeyB64),
    );

export const encryptChatField = async (
    value: string,
    chatKeyB64: string,
): Promise<string> => (await ensuCrypto()).encryptField(value, chatKeyB64);

export const decryptChatField = async (
    value: string,
    chatKeyB64: string,
): Promise<string> => (await ensuCrypto()).decryptField(value, chatKeyB64);
