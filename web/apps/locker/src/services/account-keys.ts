import { masterKeyFromSession as readMasterKeyFromSession } from "ente-accounts/services/session-storage";
import { decryptBox } from "ente-locker-wasm";

export const masterKeyFromSession = () => readMasterKeyFromSession(decryptBox);
