import { decryptBox } from "ente-prelogin-wasm";
import {
    masterKeyFromSession as readMasterKeyFromSession,
    ensureMasterKeyFromSession as readRequiredMasterKeyFromSession,
} from "./session-storage";

export const masterKeyFromSession = () => readMasterKeyFromSession(decryptBox);

export const ensureMasterKeyFromSession = () =>
    readRequiredMasterKeyFromSession(decryptBox);
