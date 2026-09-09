import { z } from "zod";

export const clearSessionStorage = () => sessionStorage.clear();

export const haveMasterKeyInSession = () =>
    !!sessionStorage.getItem("encryptionKey");

export const clearStashedKeyEncryptionKeyFromSession = () =>
    sessionStorage.removeItem("keyEncryptionKey");

const SessionKeyData = z.object({
    encryptedData: z.string(),
    key: z.string(),
    nonce: z.string(),
});

type SessionKeyData = z.infer<typeof SessionKeyData>;

interface SessionStorageCrypto {
    decryptBox: (
        box: { encryptedData: string; nonce: string },
        key: string,
    ) => Promise<string>;
    encryptBox: (
        data: string,
        key: string,
    ) => Promise<{ encryptedData: string; nonce: string }>;
    generateKey: () => Promise<string>;
}

export const createSessionStorage = ({
    decryptBox,
    encryptBox,
    generateKey,
}: SessionStorageCrypto) => {
    const sessionKeyData = async (keyData: string): Promise<SessionKeyData> => {
        const key = await generateKey();
        const box = await encryptBox(keyData, key);
        return { key, ...box };
    };

    const saveKeyInSessionStore = async (keyName: string, keyData: string) => {
        sessionStorage.setItem(
            keyName,
            JSON.stringify(await sessionKeyData(keyData)),
        );
    };

    const masterKeyFromSession = async () => {
        const value = sessionStorage.getItem("encryptionKey");
        if (!value) return undefined;

        const { encryptedData, key, nonce } = SessionKeyData.parse(
            JSON.parse(value),
        );
        return decryptBox({ encryptedData, nonce }, key);
    };

    const ensureMasterKeyFromSession = async () => {
        const key = await masterKeyFromSession();
        if (!key) throw new Error("Master key not found in session");
        return key;
    };

    const saveMasterKeyInSessionAndSafeStore = async (masterKey: string) => {
        await saveKeyInSessionStore("encryptionKey", masterKey);
        try {
            await globalThis.electron?.saveMasterKeyInSafeStorage(masterKey);
        } catch {
            // Best effort, matching the current accounts package behaviour.
        }
    };

    const updateSessionFromElectronSafeStorageIfNeeded = async () => {
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

    const stashKeyEncryptionKeyInSessionStore = (kek: string) =>
        saveKeyInSessionStore("keyEncryptionKey", kek);

    const unstashKeyEncryptionKeyFromSession = async () => {
        const value = sessionStorage.getItem("keyEncryptionKey");
        if (!value) return undefined;

        clearStashedKeyEncryptionKeyFromSession();

        const { encryptedData, key, nonce } = SessionKeyData.parse(
            JSON.parse(value),
        );
        return decryptBox({ encryptedData, nonce }, key);
    };

    return {
        ensureMasterKeyFromSession,
        masterKeyFromSession,
        saveMasterKeyInSessionAndSafeStore,
        stashKeyEncryptionKeyInSessionStore,
        unstashKeyEncryptionKeyFromSession,
        updateSessionFromElectronSafeStorageIfNeeded,
    };
};
