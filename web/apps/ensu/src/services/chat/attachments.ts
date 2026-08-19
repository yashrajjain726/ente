import { ensuCrypto } from "../wasm";

export const encryptAttachmentBytes = async (
    bytes: Uint8Array,
    chatKeyB64: string,
    sessionUuid: string,
): Promise<Uint8Array<ArrayBuffer>> =>
    (await ensuCrypto()).encryptAttachment(bytes, chatKeyB64, sessionUuid);

export const decryptAttachmentBytes = async (
    encrypted: Uint8Array,
    chatKeyB64: string,
    sessionUuid: string,
): Promise<Uint8Array<ArrayBuffer>> =>
    (await ensuCrypto()).decryptAttachment(encrypted, chatKeyB64, sessionUuid);
