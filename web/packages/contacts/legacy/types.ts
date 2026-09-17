export interface LegacyUser {
    id: number;
    email: string;
}

export interface LegacyContactRecord {
    user: LegacyUser;
    emergencyContact: LegacyUser;
    state:
        | "INVITED"
        | "REVOKED"
        | "ACCEPTED"
        | "CONTACT_LEFT"
        | "CONTACT_DENIED";
    recoveryNoticeInDays: number;
}

export interface LegacyRecoverySession {
    id: string;
    user: LegacyUser;
    emergencyContact: LegacyUser;
    status:
        | "INITIATED"
        | "WAITING"
        | "REJECTED"
        | "RECOVERED"
        | "STOPPED"
        | "READY";
    waitTill: number;
    createdAt: number;
}

export interface LegacyInfo {
    contacts: LegacyContactRecord[];
    recoverSessions: LegacyRecoverySession[];
    othersEmergencyContact: LegacyContactRecord[];
    othersRecoverySession: LegacyRecoverySession[];
}

export interface LegacySuggestedUser {
    id?: number;
    email: string;
}

export interface LegacyService {
    getInfo(): Promise<LegacyInfo>;
    publicKey(email: string): Promise<string | undefined>;
    verificationID(email: string): Promise<string | undefined>;
    addContact(email: string, recoveryNoticeInDays?: number): Promise<void>;
    updateContact(
        userID: number,
        emergencyContactID: number,
        state: LegacyContactRecord["state"],
    ): Promise<void>;
    updateRecoveryNotice(
        emergencyContactID: number,
        recoveryNoticeInDays: number,
    ): Promise<void>;
    startRecovery(userID: number, emergencyContactID: number): Promise<void>;
    stopRecovery(
        recoveryID: string,
        userID: number,
        emergencyContactID: number,
    ): Promise<void>;
    rejectRecovery(
        recoveryID: string,
        userID: number,
        emergencyContactID: number,
    ): Promise<void>;
    changePassword(recoveryID: string, newPassword: string): Promise<void>;
}
