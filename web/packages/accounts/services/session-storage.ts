import { z } from "zod";
import { decryptBox, encryptBox, generateKey } from "./crypto";

export const clearSessionStorage = () => sessionStorage.clear();

const SessionKeyData = z.object({
    encryptedData: z.string(),
    key: z.string(),
    nonce: z.string(),
});

type SessionKeyData = z.infer<typeof SessionKeyData>;

export type DecryptBox = (
    box: { encryptedData: string; nonce: string },
    key: string,
) => Promise<string>;

const sessionKeyData = async (keyData: string): Promise<SessionKeyData> => {
    const key = await generateKey();
    const box = await encryptBox(keyData, key);
    return { key, ...box };
};

export const ensureMasterKeyFromSession = async (decrypt: DecryptBox) => {
    const key = await masterKeyFromSession(decrypt);
    if (!key) throw new Error("Master key not found in session");
    return key;
};

export const haveMasterKeyInSession = () =>
    !!sessionStorage.getItem("encryptionKey");

export const masterKeyFromSession = async (decrypt: DecryptBox) => {
    const value = sessionStorage.getItem("encryptionKey");
    if (!value) return undefined;

    const { encryptedData, key, nonce } = SessionKeyData.parse(
        JSON.parse(value),
    );
    return decrypt({ encryptedData, nonce }, key);
};

export const saveMasterKeyInSessionAndSafeStore = async (masterKey: string) => {
    await saveKeyInSessionStore("encryptionKey", masterKey);
    try {
        await globalThis.electron?.saveMasterKeyInSafeStorage(masterKey);
    } catch {
        // Best effort, matching the current accounts package behaviour.
    }
};

const saveKeyInSessionStore = async (keyName: string, keyData: string) => {
    sessionStorage.setItem(
        keyName,
        JSON.stringify(await sessionKeyData(keyData)),
    );
};

export const updateSessionFromElectronSafeStorageIfNeeded = async () => {
    const electron = globalThis.electron;
    if (!electron || haveMasterKeyInSession()) return;

    let masterKey: string | undefined;
    try {
        masterKey = await electron.masterKeyFromSafeStorage();
    } catch {
        masterKey = undefined;
    }

    if (masterKey) await saveKeyInSessionStore("encryptionKey", masterKey);
};

export const stashKeyEncryptionKeyInSessionStore = (kek: string) =>
    saveKeyInSessionStore("keyEncryptionKey", kek);

export const clearStashedKeyEncryptionKeyFromSession = () =>
    sessionStorage.removeItem("keyEncryptionKey");

export const unstashKeyEncryptionKeyFromSession = async () => {
    const value = sessionStorage.getItem("keyEncryptionKey");
    if (!value) return undefined;

    clearStashedKeyEncryptionKeyFromSession();

    const { encryptedData, key, nonce } = SessionKeyData.parse(
        JSON.parse(value),
    );
    return decryptBox({ encryptedData, nonce }, key);
};
