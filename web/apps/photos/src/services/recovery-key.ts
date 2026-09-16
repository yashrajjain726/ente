import { createAuthenticatedRecoveryKeyOps } from "ente-accounts/services/authenticated-recovery-key";
import { encryptBoxWithRecoveryKey, generateKey } from "ente-photos-wasm";
import { ensureAuthenticatedSession } from "./authenticated-session";

export const {
    encryptWithRecoveryKey,
    generatePasskeyRecovery,
    recoveryKeyMnemonic,
} = createAuthenticatedRecoveryKeyOps({
    ensureSession: ensureAuthenticatedSession,
    encryptBox: encryptBoxWithRecoveryKey,
    generateKey,
});
