import { masterKeyFromSession as readMasterKeyFromSession } from "ente-accounts/services/session-storage";
import { ensureUserKeyPair as readUserKeyPair } from "ente-accounts/services/user";
import { decryptBox } from "ente-locker-wasm";

export const masterKeyFromSession = () => readMasterKeyFromSession(decryptBox);

export const ensureUserKeyPair = () => readUserKeyPair(decryptBox);
