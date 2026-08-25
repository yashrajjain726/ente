import { savedKeyAttributes } from "ente-accounts/services/accounts-db";
import { getUserRecoveryKey } from "ente-accounts/services/recovery-key";
import { masterKeyFromSession } from "ente-accounts/services/session-storage";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import { openLegacy } from "ente-legacy-wasm/authenticated";
import type { LegacyContactState, LegacyInfo } from "./types";

type LegacyClient = Awaited<ReturnType<typeof openLegacy>>;

const withLegacyClient = async <T>(
    operation: (client: LegacyClient) => T | Promise<T>,
) => {
    const masterKeyB64 = await masterKeyFromSession();
    if (!masterKeyB64) {
        throw new Error("Missing current master key");
    }
    const authToken = await savedAuthToken();
    if (!authToken) {
        throw new Error("Missing auth token");
    }
    const client = await openLegacy({
        baseUrl: await apiOrigin(),
        authToken,
        masterKeyB64,
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
    });
    try {
        return await operation(client);
    } finally {
        client.close();
    }
};

const currentKeyAttributes = () => {
    const keyAttributes = savedKeyAttributes();
    if (!keyAttributes) {
        throw new Error("Missing current key attributes");
    }
    return keyAttributes;
};

export const legacyGetInfo = (): Promise<LegacyInfo> =>
    withLegacyClient((client) => client.getInfo());

export const legacyPublicKey = (email: string) =>
    withLegacyClient((client) => client.publicKey(email));

export const legacyVerificationID = (email: string) =>
    withLegacyClient(async (client) => {
        const publicKey = await client.publicKey(email);
        return publicKey ? client.verificationID(publicKey) : undefined;
    });

export const legacyAddContact = async (
    email: string,
    recoveryNoticeInDays?: number,
) => {
    await getUserRecoveryKey();
    return withLegacyClient((client) =>
        client.addContact(email, currentKeyAttributes(), recoveryNoticeInDays),
    );
};

export const legacyUpdateContact = (
    userID: number,
    emergencyContactID: number,
    state: LegacyContactState,
) =>
    withLegacyClient((client) =>
        client.updateContact(userID, emergencyContactID, state),
    );

export const legacyUpdateRecoveryNotice = (
    emergencyContactID: number,
    recoveryNoticeInDays: number,
) =>
    withLegacyClient((client) =>
        client.updateRecoveryNotice(emergencyContactID, recoveryNoticeInDays),
    );

export const legacyStartRecovery = (
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.startRecovery(userID, emergencyContactID),
    );

export const legacyStopRecovery = (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.stopRecovery(recoveryID, userID, emergencyContactID),
    );

export const legacyRejectRecovery = (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.rejectRecovery(recoveryID, userID, emergencyContactID),
    );

export const legacyChangePassword = (recoveryID: string, newPassword: string) =>
    withLegacyClient((client) =>
        client.changePassword(recoveryID, currentKeyAttributes(), newPassword),
    );
