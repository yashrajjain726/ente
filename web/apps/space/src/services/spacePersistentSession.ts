import {
    replaceSavedLocalUser,
    savedPartialLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import {
    decryptBox,
    encryptBox,
    fromB64,
    generateKey,
    toB64,
} from "ente-accounts-rs/services/crypto";
import { ensureOk, publicRequestHeaders } from "ente-base/http";
import { apiURL } from "ente-base/origins";
import { removeAuthToken } from "ente-base/token";
import {
    Key,
    secretboxDecryptCombined,
    secretboxEncryptCombined,
} from "ente-wasm-core";
import { spaceBootstrapAuthHeaders } from "services/spaceBootstrapAuth";
import {
    clearSpaceSecureSessionStorage,
    saveSpaceRootKeyInSpaceSession,
    spaceRootKeyFromSpaceSession,
} from "services/spaceSecureSessionStorage";
import { z } from "zod";

const spaceBrowserSessionStorageKey = "spaceBrowserSession";
const spaceSessionTokenHeader = "X-Space-Session-Token";

const PersistedSpaceBrowserSession = z.object({
    encryptedSpaceRootKey: z.string(),
    email: z.string(),
    nonce: z.string(),
    sessionToken: z.string(),
    userId: z.number(),
});

const SpaceBrowserSessionResponse = z.object({ sessionToken: z.string() });

const SpaceBrowserSessionBootstrapResponse = z.object({
    sessionWrapKey: z.string(),
});

const SpaceEntityKeyResponse = z.object({ encryptedKey: z.string() });

const masterKeyToSecretboxKey = async (masterKey: string) =>
    Key.fromBytes(await fromB64(masterKey));

const encryptSpaceRootEntityKey = async (
    spaceRootKey: string,
    masterKey: string,
) =>
    toB64(
        await secretboxEncryptCombined(
            await fromB64(spaceRootKey),
            await masterKeyToSecretboxKey(masterKey),
        ),
    );

const decryptSpaceRootEntityKey = async (
    encryptedKey: string,
    masterKey: string,
) =>
    toB64(
        await secretboxDecryptCombined(
            await fromB64(encryptedKey),
            await masterKeyToSecretboxKey(masterKey),
        ),
    );

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
    spaceRootKey: string,
    authToken: string,
) => {
    const sessionWrapKey = await generateKey();
    const res = await fetch(await apiURL("/account/space/sessions"), {
        method: "POST",
        headers: {
            ...spaceBootstrapAuthHeaders(authToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionWrapKey }),
    });
    ensureOk(res);
    const { sessionToken } = SpaceBrowserSessionResponse.parse(
        await res.json(),
    );

    const user = savedPartialLocalUser();
    if (!user?.id || !user.email) {
        throw new Error("Space user is missing.");
    }
    const box = await encryptBox(spaceRootKey, sessionWrapKey);
    localStorage.setItem(
        spaceBrowserSessionStorageKey,
        JSON.stringify({
            encryptedSpaceRootKey: box.encryptedData,
            email: user.email,
            nonce: box.nonce,
            sessionToken,
            userId: user.id,
        }),
    );
    saveSpaceRootKeyInSpaceSession(spaceRootKey);
    await forgetBootstrapToken();
};

let pendingRestore: Promise<boolean> | undefined;

export const restoreSpaceBrowserSessionIfNeeded = async () => {
    if (
        spaceRootKeyFromSpaceSession() &&
        savedPartialLocalUser()?.id &&
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

    const res = await fetch(await apiURL("/account/space/sessions/bootstrap"), {
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
    const spaceRootKey = await decryptBox(
        {
            encryptedData: persisted.encryptedSpaceRootKey,
            nonce: persisted.nonce,
        },
        bootstrap.sessionWrapKey,
    );
    replaceSavedLocalUser({ id: persisted.userId, email: persisted.email });
    saveSpaceRootKeyInSpaceSession(spaceRootKey);
    await removeAuthToken();
    return true;
};

export const getOrCreateSpaceRootKey = async (
    masterKey: string,
    authToken: string,
) => {
    const candidate = await generateKey();
    const encryptedKey = await encryptSpaceRootEntityKey(candidate, masterKey);
        const res = await fetch(await apiURL("/account/space/entity-key/ensure"), {
        method: "POST",
        headers: {
            ...spaceBootstrapAuthHeaders(authToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "space", encryptedKey }),
    });
    ensureOk(res);
    const ensured = SpaceEntityKeyResponse.parse(await res.json());
    return decryptSpaceRootEntityKey(ensured.encryptedKey, masterKey);
};

export const revokeSpaceBrowserSession = async () => {
    const sessionToken = savedSpaceSessionToken();
    try {
        if (!sessionToken) return;
        const res = await fetch(await apiURL("/account/space/sessions/current"), {
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
