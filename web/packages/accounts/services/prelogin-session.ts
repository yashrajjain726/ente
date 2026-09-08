import { decryptBox, encryptBox, generateKey } from "ente-prelogin-wasm";
import { createSessionStorage } from "./session-storage";

export const {
    ensureMasterKeyFromSession,
    masterKeyFromSession,
    saveMasterKeyInSessionAndSafeStore,
    stashKeyEncryptionKeyInSessionStore,
    unstashKeyEncryptionKeyFromSession,
    updateSessionFromElectronSafeStorageIfNeeded,
} = createSessionStorage({ decryptBox, encryptBox, generateKey });
