import { z } from "zod";
import { decryptBox, encryptBox, generateKey } from "./crypto";
import log from "./log";

export const clearSessionStorage = () => sessionStorage.clear();

const SessionKeyData = z.object({
    encryptedData: z.string(),
    key: z.string(),
    nonce: z.string(),
});

type SessionKeyData = z.infer<typeof SessionKeyData>;

const sessionKeyData = async (keyData: string): Promise<SessionKeyData> => {
    const key = await generateKey();
    const box = await encryptBox(keyData, key);
    return { key, ...box };
};

export const ensureMasterKeyFromSession = async () => {
    const key = await masterKeyFromSession();
    if (!key) throw new Error("Master key not found in session");
    return key;
};

export const haveMasterKeyInSession = () =>
    !!sessionStorage.getItem("encryptionKey");

export const masterKeyFromSession = async () => {
    const value = sessionStorage.getItem("encryptionKey");
    if (!value) return undefined;

    const { encryptedData, key, nonce } = SessionKeyData.parse(
        JSON.parse(value),
    );
    return decryptBox({ encryptedData, nonce }, key);
};

// Desktop safe storage is optional; failures fall back to password entry next session.
export const saveMasterKeyInSessionAndSafeStore = async (masterKey: string) => {
    await saveKeyInSessionStore("encryptionKey", masterKey);
    try {
        await globalThis.electron?.saveMasterKeyInSafeStorage(masterKey);
    } catch (e) {
        log.warn("Failed to save master key in safe storage", e);
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
    if (!electron) return;

    if (haveMasterKeyInSession()) return;

    let masterKey: string | undefined;
    try {
        masterKey = await electron.masterKeyFromSafeStorage();
    } catch (e) {
        log.warn("Failed to read master key from safe storage", e);
    }
    if (masterKey) {
        await saveKeyInSessionStore("encryptionKey", masterKey);
    }
};

// Session storage carries the KEK across the 2FA app redirect.
export const stashKeyEncryptionKeyInSessionStore = (kek: string) =>
    saveKeyInSessionStore("keyEncryptionKey", kek);

export const unstashKeyEncryptionKeyFromSession = async () => {
    const value = sessionStorage.getItem("keyEncryptionKey");
    if (!value) return undefined;

    // Consume the stashed KEK once.
    sessionStorage.removeItem("keyEncryptionKey");

    const { encryptedData, key, nonce } = SessionKeyData.parse(
        JSON.parse(value),
    );
    return decryptBox({ encryptedData, nonce }, key);
};
