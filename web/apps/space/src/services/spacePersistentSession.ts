import {
    replaceSavedLocalUser,
    savedKeyAttributes,
    savedPartialLocalUser,
    saveKeyAttributes,
    saveOriginalKeyAttributes,
} from "ente-accounts-rs/services/accounts-db";
import {
    decryptBox,
    encryptBox,
    generateKey,
} from "ente-accounts-rs/services/crypto";
import { RemoteKeyAttributes } from "ente-accounts-rs/services/user";
import { ensureOk, publicRequestHeaders } from "ente-base/http";
import { apiURL } from "ente-base/origins";
import { removeAuthToken } from "ente-base/token";
import { spaceBootstrapAuthHeaders } from "services/spaceBootstrapAuth";
import {
    clearSpaceSecureSessionStorage,
    masterKeyFromSpaceSession,
    saveMasterKeyInSpaceSession,
} from "services/spaceSecureSessionStorage";
import { z } from "zod";

const spaceBrowserSessionStorageKey = "spaceBrowserSession";
const spaceSessionTokenHeader = "X-Space-Session-Token";

const PersistedSpaceBrowserSession = z.object({
    encryptedMasterKey: z.string(),
    email: z.string(),
    nonce: z.string(),
    sessionToken: z.string(),
    userId: z.number(),
    version: z.literal(3),
});

const SpaceBrowserSessionResponse = z.object({ sessionToken: z.string() });

const SpaceBrowserSessionBootstrapResponse = z.object({
    id: z.number(),
    clientKey: z.string(),
    keyAttributes: RemoteKeyAttributes,
});

const savedPersistedSession = () => {
    const value = localStorage.getItem(spaceBrowserSessionStorageKey);
    if (!value) return undefined;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        clearSpaceBrowserSession();
        return undefined;
    }
    const { data, success } = PersistedSpaceBrowserSession.safeParse(parsed);
    if (success) return data;
    clearSpaceBrowserSession();
    return undefined;
};

export const clearSpaceBrowserSession = () => {
    localStorage.removeItem(spaceBrowserSessionStorageKey);
    clearSpaceSecureSessionStorage();
};

export const savedSpaceSessionToken = () =>
    savedPersistedSession()?.sessionToken;

const forgetBootstrapToken = async () => {
    const user = savedPartialLocalUser();
    if (user?.id && user.email) {
        replaceSavedLocalUser({ id: user.id, email: user.email });
    }
    await removeAuthToken();
};

export const createSpaceBrowserSession = async (
    masterKey: string,
    authToken: string,
) => {
    const clientKey = await generateKey();
    const res = await fetch(await apiURL("/space/sessions"), {
        method: "POST",
        headers: {
            ...spaceBootstrapAuthHeaders(authToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientKey }),
    });
    ensureOk(res);
    const { sessionToken } = SpaceBrowserSessionResponse.parse(
        await res.json(),
    );

    const user = savedPartialLocalUser();
    if (!user?.id || !user.email) {
        throw new Error("Space user is missing.");
    }
    const box = await encryptBox(masterKey, clientKey);
    localStorage.setItem(
        spaceBrowserSessionStorageKey,
        JSON.stringify({
            encryptedMasterKey: box.encryptedData,
            email: user.email,
            nonce: box.nonce,
            sessionToken,
            userId: user.id,
            version: 3,
        }),
    );
    await forgetBootstrapToken();
};

let pendingRestore: Promise<boolean> | undefined;

export const restoreSpaceBrowserSessionIfNeeded = async () => {
    if (
        masterKeyFromSpaceSession() &&
        savedPartialLocalUser()?.id &&
        savedKeyAttributes() &&
        savedSpaceSessionToken()
    ) {
        return true;
    }
    pendingRestore ??= restoreSpaceBrowserSession().finally(() => {
        pendingRestore = undefined;
    });
    return pendingRestore;
};

const restoreSpaceBrowserSession = async () => {
    const persisted = savedPersistedSession();
    if (!persisted) return false;

    const res = await fetch(await apiURL("/space/sessions/bootstrap"), {
        method: "POST",
        headers: {
            ...publicRequestHeaders(),
            [spaceSessionTokenHeader]: persisted.sessionToken,
        },
    });
    if (res.status == 401) {
        clearSpaceBrowserSession();
        return false;
    }
    ensureOk(res);
    const bootstrap = SpaceBrowserSessionBootstrapResponse.parse(
        await res.json(),
    );
    if (persisted.userId != bootstrap.id) {
        clearSpaceBrowserSession();
        return false;
    }
    const masterKey = await decryptBox(
        { encryptedData: persisted.encryptedMasterKey, nonce: persisted.nonce },
        bootstrap.clientKey,
    );
    replaceSavedLocalUser({ id: bootstrap.id, email: persisted.email });
    saveKeyAttributes(bootstrap.keyAttributes);
    saveOriginalKeyAttributes(bootstrap.keyAttributes);
    saveMasterKeyInSpaceSession(masterKey);
    await removeAuthToken();
    return true;
};

export const revokeSpaceBrowserSession = async () => {
    const sessionToken = savedSpaceSessionToken();
    try {
        if (!sessionToken) return;
        const res = await fetch(await apiURL("/space/sessions/current"), {
            method: "DELETE",
            headers: {
                ...publicRequestHeaders(),
                [spaceSessionTokenHeader]: sessionToken,
            },
        });
        if (res.status != 401) ensureOk(res);
    } catch {
        // Local logout must still complete if remote session revocation fails.
    } finally {
        clearSpaceBrowserSession();
    }
};
