import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import { openSession, type Session } from "ente-photos-wasm";

let current: { key: string; session: Session } | undefined;

export const openAuthenticatedSession = async (
    userID: number,
    authToken: string,
    masterKeyB64: string,
) => {
    const baseUrl = await apiOrigin();
    const key = `${baseUrl}:${userID}`;
    if (current?.key === key) {
        current.session.updateAuthToken(authToken);
        return current.session;
    }

    const session = await openSession({
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
    });
    current = { key, session };
    return session;
};

export const authenticatedSession = () => {
    if (!current) throw new Error("Authenticated session is not open");
    return current.session;
};
