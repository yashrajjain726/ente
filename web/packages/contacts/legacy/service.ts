import { savedKeyAttributes } from "ente-accounts/services/accounts-db";
import { getUserRecoveryKey } from "ente-accounts/services/recovery-key";
import { masterKeyFromSession } from "ente-accounts/services/session-storage";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import { openLegacy } from "ente-legacy-wasm/authenticated";
import type {
    LegacyContactState,
    LegacyInfo,
    LegacyRecoveryStatus,
} from "./types";

type KeyAttributes = NonNullable<ReturnType<typeof savedKeyAttributes>>;

interface RemoteLegacyUser {
    id: number | bigint;
    email: string;
}

interface RemoteLegacyContactRecord {
    user: RemoteLegacyUser;
    emergencyContact: RemoteLegacyUser;
    state: LegacyContactState;
    recoveryNoticeInDays: number | bigint;
}

interface RemoteLegacyRecoverySession {
    id: string;
    user: RemoteLegacyUser;
    emergencyContact: RemoteLegacyUser;
    status: LegacyRecoveryStatus;
    waitTill: number | bigint;
    createdAt: number | bigint;
}

interface RemoteLegacyInfo {
    contacts: RemoteLegacyContactRecord[];
    recoverSessions: RemoteLegacyRecoverySession[];
    othersEmergencyContact: RemoteLegacyContactRecord[];
    othersRecoverySession: RemoteLegacyRecoverySession[];
}

interface LegacyClient {
    free: () => void;
    getInfo: () => Promise<RemoteLegacyInfo>;
    publicKey: (email: string) => Promise<string | undefined>;
    verificationID: (publicKeyB64: string) => string;
    addContact: (
        email: string,
        currentUserKeyAttributes: KeyAttributes,
        recoveryNoticeInDays?: number,
    ) => Promise<void>;
    updateContact: (
        userID: bigint,
        emergencyContactID: bigint,
        state: LegacyContactState,
    ) => Promise<void>;
    updateRecoveryNotice: (
        emergencyContactID: bigint,
        recoveryNoticeInDays: number,
    ) => Promise<void>;
    startRecovery: (
        userID: bigint,
        emergencyContactID: bigint,
    ) => Promise<void>;
    stopRecovery: (
        recoveryID: string,
        userID: bigint,
        emergencyContactID: bigint,
    ) => Promise<void>;
    rejectRecovery: (
        recoveryID: string,
        userID: bigint,
        emergencyContactID: bigint,
    ) => Promise<void>;
    changePassword: (
        recoveryID: string,
        currentUserKeyAttributes: KeyAttributes,
        newPassword: string,
    ) => Promise<void>;
}

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
    const client: LegacyClient = await openLegacy({
        baseUrl: await apiOrigin(),
        authToken,
        masterKeyB64,
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
    });
    try {
        return await operation(client);
    } finally {
        client.free();
    }
};

const currentKeyAttributes = () => {
    const keyAttributes = savedKeyAttributes();
    if (!keyAttributes) {
        throw new Error("Missing current key attributes");
    }
    return keyAttributes;
};

const normalizeLegacyUser = (user: RemoteLegacyUser) => ({
    id: Number(user.id),
    email: user.email,
});

const normalizeLegacyContactRecord = (record: RemoteLegacyContactRecord) => ({
    user: normalizeLegacyUser(record.user),
    emergencyContact: normalizeLegacyUser(record.emergencyContact),
    state: record.state,
    recoveryNoticeInDays: Number(record.recoveryNoticeInDays),
});

const normalizeLegacyRecoverySession = (
    session: RemoteLegacyRecoverySession,
) => ({
    id: session.id,
    user: normalizeLegacyUser(session.user),
    emergencyContact: normalizeLegacyUser(session.emergencyContact),
    status: session.status,
    waitTill: Number(session.waitTill),
    createdAt: Number(session.createdAt),
});

const normalizeLegacyInfo = (info: RemoteLegacyInfo): LegacyInfo => ({
    contacts: info.contacts.map(normalizeLegacyContactRecord),
    recoverSessions: info.recoverSessions.map(normalizeLegacyRecoverySession),
    othersEmergencyContact: info.othersEmergencyContact.map(
        normalizeLegacyContactRecord,
    ),
    othersRecoverySession: info.othersRecoverySession.map(
        normalizeLegacyRecoverySession,
    ),
});

export const legacyGetInfo = () =>
    withLegacyClient(async (client) =>
        normalizeLegacyInfo(await client.getInfo()),
    );

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
        client.updateContact(BigInt(userID), BigInt(emergencyContactID), state),
    );

export const legacyUpdateRecoveryNotice = (
    emergencyContactID: number,
    recoveryNoticeInDays: number,
) =>
    withLegacyClient((client) =>
        client.updateRecoveryNotice(
            BigInt(emergencyContactID),
            recoveryNoticeInDays,
        ),
    );

export const legacyStartRecovery = (
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.startRecovery(BigInt(userID), BigInt(emergencyContactID)),
    );

export const legacyStopRecovery = (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.stopRecovery(
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),
    );

export const legacyRejectRecovery = (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withLegacyClient((client) =>
        client.rejectRecovery(
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),
    );

export const legacyChangePassword = (recoveryID: string, newPassword: string) =>
    withLegacyClient((client) =>
        client.changePassword(recoveryID, currentKeyAttributes(), newPassword),
    );
