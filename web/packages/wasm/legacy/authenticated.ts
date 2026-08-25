export interface SessionInput {
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

type Wasm = typeof import("./pkg/ente_legacy_wasm");
type Session = ReturnType<Wasm["openSession"]>;

const withSession = async <T>(
    {
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    }: SessionInput,
    operation: (wasm: Wasm, session: Session) => Promise<T>,
) => {
    const wasm = await import("./pkg/ente_legacy_wasm");
    const session = wasm.openSession(
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    );
    try {
        return await operation(wasm, session);
    } finally {
        session.free();
    }
};

export const getInfo = (input: SessionInput) =>
    withSession(
        input,
        (wasm, session) => wasm.legacyGetInfo(session) as Promise<LegacyInfo>,
    );

export const publicKey = (input: SessionInput, email: string) =>
    withSession(input, (wasm, session) => wasm.legacyPublicKey(session, email));

export const verificationID = async (publicKeyB64: string) => {
    const wasm = await import("./pkg/ente_legacy_wasm");
    return wasm.legacyVerificationID(publicKeyB64);
};

export const addContact = (
    input: SessionInput,
    email: string,
    currentUserKeyAttributes: KeyAttributes,
    recoveryNoticeInDays?: number,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyAddContact(
            session,
            email,
            currentUserKeyAttributes,
            recoveryNoticeInDays,
        ),
    );

export const updateContact = (
    input: SessionInput,
    userID: number,
    emergencyContactID: number,
    state: LegacyContactState,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyUpdateContact(
            session,
            BigInt(userID),
            BigInt(emergencyContactID),
            state,
        ),
    );

export const updateRecoveryNotice = (
    input: SessionInput,
    emergencyContactID: number,
    recoveryNoticeInDays: number,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyUpdateRecoveryNotice(
            session,
            BigInt(emergencyContactID),
            recoveryNoticeInDays,
        ),
    );

export const startRecovery = (
    input: SessionInput,
    userID: number,
    emergencyContactID: number,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyStartRecovery(
            session,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),
    );

export const stopRecovery = (
    input: SessionInput,
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyStopRecovery(
            session,
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),
    );

export const rejectRecovery = (
    input: SessionInput,
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyRejectRecovery(
            session,
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),
    );

export const changePassword = (
    input: SessionInput,
    recoveryID: string,
    currentUserKeyAttributes: KeyAttributes,
    newPassword: string,
) =>
    withSession(input, (wasm, session) =>
        wasm.legacyChangePassword(
            session,
            recoveryID,
            currentUserKeyAttributes,
            newPassword,
        ),
    );
