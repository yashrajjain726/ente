import { createAuthenticatedSessionCache } from "ente-accounts/services/authenticated-session";
import { masterKeyFromSession } from "ente-new/photos/services/account-keys";
import {
    bindCollectionKeyOpener,
    unbindCollectionKeyOpener,
} from "ente-new/photos/services/collection";
import { openCollectionKey, openSession, type Session } from "ente-photos-wasm";

const sessions = createAuthenticatedSessionCache((input): Promise<Session> => {
    const opening = openSession(input);
    bindCollectionKeyOpener(async (input) =>
        openCollectionKey(
            await sessions.ensure(),
            input.ownerID,
            input.encryptedKey,
            input.keyDecryptionNonce,
        ),
    );
    return opening;
}, masterKeyFromSession);

export const openAuthenticatedSession = sessions.open;
export const ensureAuthenticatedSession = sessions.ensure;

export const clearAuthenticatedSession = () => {
    sessions.clear();
    unbindCollectionKeyOpener();
};
