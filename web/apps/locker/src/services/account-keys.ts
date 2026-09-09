import { createSessionStorage } from "ente-accounts/services/session-storage";
import { decryptBox, encryptBox, generateKey } from "ente-locker-wasm";

export const { masterKeyFromSession } = createSessionStorage({
    decryptBox,
    encryptBox,
    generateKey,
});
