export interface OpenLegacyInput {
    baseUrl: string;
    authToken: string;
    masterKeyB64: string;
    clientPackage?: string;
    clientVersion?: string;
}

interface KeyAttributes {
    kekSalt: string;
    kekHash?: string;
    encryptedKey: string;
    keyDecryptionNonce: string;
    publicKey: string;
    encryptedSecretKey: string;
    secretKeyDecryptionNonce: string;
    memLimit: number;
    opsLimit: number;
    masterKeyEncryptedWithRecoveryKey?: string;
    masterKeyDecryptionNonce?: string;
    recoveryKeyEncryptedWithMasterKey?: string;
    recoveryKeyDecryptionNonce?: string;
}

type LegacyContactState =
    | "INVITED"
    | "REVOKED"
    | "ACCEPTED"
    | "CONTACT_LEFT"
    | "CONTACT_DENIED";

type LegacyRecoveryStatus =
    | "INITIATED"
    | "WAITING"
    | "REJECTED"
    | "RECOVERED"
    | "STOPPED"
    | "READY";

interface LegacyUser {
    id: number;
    email: string;
}

interface LegacyContactRecord {
    user: LegacyUser;
    emergencyContact: LegacyUser;
    state: LegacyContactState;
    recoveryNoticeInDays: number;
}

interface LegacyRecoverySession {
    id: string;
    user: LegacyUser;
    emergencyContact: LegacyUser;
    status: LegacyRecoveryStatus;
    waitTill: number;
    createdAt: number;
}

interface LegacyInfo {
    contacts: LegacyContactRecord[];
    recoverSessions: LegacyRecoverySession[];
    othersEmergencyContact: LegacyContactRecord[];
    othersRecoverySession: LegacyRecoverySession[];
}

export const openLegacy = async ({
    baseUrl,
    authToken,
    masterKeyB64,
    clientPackage,
    clientVersion,
}: OpenLegacyInput) => {
    const client = (await import("./pkg/ente_legacy_wasm")).openLegacy(
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    );

    return {
        close: () => client.free(),
        getInfo: () => client.getInfo() as Promise<LegacyInfo>,
        publicKey: (email: string) => client.publicKey(email),
        verificationID: (publicKeyB64: string) =>
            client.verificationID(publicKeyB64),
        addContact: (
            email: string,
            currentUserKeyAttributes: KeyAttributes,
            recoveryNoticeInDays?: number,
        ) =>
            client.addContact(
                email,
                currentUserKeyAttributes,
                recoveryNoticeInDays,
            ),
        updateContact: (
            userID: number,
            emergencyContactID: number,
            state: LegacyContactState,
        ) =>
            client.updateContact(
                BigInt(userID),
                BigInt(emergencyContactID),
                state,
            ),
        updateRecoveryNotice: (
            emergencyContactID: number,
            recoveryNoticeInDays: number,
        ) =>
            client.updateRecoveryNotice(
                BigInt(emergencyContactID),
                recoveryNoticeInDays,
            ),
        startRecovery: (userID: number, emergencyContactID: number) =>
            client.startRecovery(BigInt(userID), BigInt(emergencyContactID)),
        stopRecovery: (
            recoveryID: string,
            userID: number,
            emergencyContactID: number,
        ) =>
            client.stopRecovery(
                recoveryID,
                BigInt(userID),
                BigInt(emergencyContactID),
            ),
        rejectRecovery: (
            recoveryID: string,
            userID: number,
            emergencyContactID: number,
        ) =>
            client.rejectRecovery(
                recoveryID,
                BigInt(userID),
                BigInt(emergencyContactID),
            ),
        changePassword: (
            recoveryID: string,
            currentUserKeyAttributes: KeyAttributes,
            newPassword: string,
        ) =>
            client.changePassword(
                recoveryID,
                currentUserKeyAttributes,
                newPassword,
            ),
    };
};
