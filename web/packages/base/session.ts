import { decryptBox, encryptBox, generateKey } from "./crypto";
import { createSessionStorage } from "./session-storage";

export const {
    ensureMasterKeyFromSession,
    masterKeyFromSession,
    updateSessionFromElectronSafeStorageIfNeeded,
} = createSessionStorage({ decryptBox, encryptBox, generateKey });
