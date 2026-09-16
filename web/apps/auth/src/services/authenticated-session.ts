import {
    ensureLocalUser,
    ensureSavedKeyAttributes,
} from "ente-accounts/services/user";
import { openSession, type Session } from "ente-auth-wasm";
import { clientPackageName } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import { masterKeyFromSession } from "./account-keys";

let current: { key: string; opening: Promise<Session> } | undefined;
let generation = 0;

export const ensureAuthenticatedSession = async () => {
    const startedGeneration = generation;
    const userID = ensureLocalUser().id;
    const [baseUrl, authToken, masterKeyB64] = await Promise.all([
        apiOrigin(),
        savedAuthToken(),
        masterKeyFromSession(),
    ]);
    if (startedGeneration !== generation) {
        throw new Error("Authenticated session was cleared");
    }
    if (!masterKeyB64) throw new Error("Missing current master key");
    if (!authToken) throw new Error("Missing auth token");

    const key = `${baseUrl}:${userID}`;
    if (current?.key !== key) {
        const opening = openSession({
            baseUrl,
            authToken,
            userID,
            masterKeyB64,
            keyAttributes: ensureSavedKeyAttributes(),
            clientPackage: clientPackageName,
        })
            .then((session) => {
                if (current?.opening !== opening) {
                    session.free();
                    throw new Error("Authenticated session was cleared");
                }
                return session;
            })
            .catch((error: unknown) => {
                if (current?.opening === opening) current = undefined;
                throw error;
            });
        current = { key, opening };
    }

    const entry = current;
    const session = await entry.opening;
    if (current !== entry) {
        throw new Error("Authenticated session was cleared");
    }
    session.updateAuthToken(authToken);
    return session;
};

export const clearAuthenticatedSession = () => {
    generation++;
    // In-flight calls may still borrow the handle; wasm-bindgen finalizes it.
    current = undefined;
};
