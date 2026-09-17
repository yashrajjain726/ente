import { createAuthenticatedSessionCache } from "ente-accounts/services/authenticated-session";
import { openSession as openLegacySession } from "ente-legacy-wasm/authenticated";
import { openSession } from "ente-locker-wasm";
import { masterKeyFromSession } from "./account-keys";

const lockerSessions = createAuthenticatedSessionCache(
    openSession,
    masterKeyFromSession,
);
const legacySessions = createAuthenticatedSessionCache(
    openLegacySession,
    masterKeyFromSession,
);

export const openAuthenticatedSession = lockerSessions.open;
export const ensureAuthenticatedSession = () =>
    lockerSessions.current() ?? lockerSessions.ensure();
export const authenticatedLegacySession = legacySessions.ensure;

export const clearAuthenticatedSession = () => {
    lockerSessions.clear();
    legacySessions.clear();
};
