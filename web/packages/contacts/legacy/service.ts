import { savedKeyAttributes } from "ente-accounts/services/accounts-db";
import { getUserRecoveryKey } from "ente-accounts/services/recovery-key";
import { masterKeyFromSession } from "ente-accounts/services/session-storage";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import {
    addContact,
    changePassword,
    getInfo,
    publicKey,
    rejectRecovery,
    startRecovery,
    stopRecovery,
    updateContact,
    updateRecoveryNotice,
    verificationID,
    type SessionInput,
} from "ente-legacy-wasm/authenticated";
import type { LegacyContactState, LegacyInfo } from "./types";

const sessionInput = async (): Promise<SessionInput> => {
    const masterKeyB64 = await masterKeyFromSession();
    if (!masterKeyB64) {
        throw new Error("Missing current master key");
    }
    const authToken = await savedAuthToken();
    if (!authToken) {
        throw new Error("Missing auth token");
    }
    return {
        baseUrl: await apiOrigin(),
        authToken,
        masterKeyB64,
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
    };
};

const currentKeyAttributes = () => {
    const keyAttributes = savedKeyAttributes();
    if (!keyAttributes) {
        throw new Error("Missing current key attributes");
    }
    return keyAttributes;
};

export const legacyGetInfo = async (): Promise<LegacyInfo> =>
    getInfo(await sessionInput());

export const legacyPublicKey = async (email: string) =>
    publicKey(await sessionInput(), email);

export const legacyVerificationID = async (email: string) => {
    const key = await publicKey(await sessionInput(), email);
    return key ? verificationID(key) : undefined;
};

export const legacyAddContact = async (
    email: string,
    recoveryNoticeInDays?: number,
) => {
    await getUserRecoveryKey();
    return addContact(
        await sessionInput(),
        email,
        currentKeyAttributes(),
        recoveryNoticeInDays,
    );
};

export const legacyUpdateContact = async (
    userID: number,
    emergencyContactID: number,
    state: LegacyContactState,
) => updateContact(await sessionInput(), userID, emergencyContactID, state);

export const legacyUpdateRecoveryNotice = async (
    emergencyContactID: number,
    recoveryNoticeInDays: number,
) =>
    updateRecoveryNotice(
        await sessionInput(),
        emergencyContactID,
        recoveryNoticeInDays,
    );

export const legacyStartRecovery = async (
    userID: number,
    emergencyContactID: number,
) => startRecovery(await sessionInput(), userID, emergencyContactID);

export const legacyStopRecovery = async (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) => stopRecovery(await sessionInput(), recoveryID, userID, emergencyContactID);

export const legacyRejectRecovery = async (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    rejectRecovery(
        await sessionInput(),
        recoveryID,
        userID,
        emergencyContactID,
    );

export const legacyChangePassword = async (
    recoveryID: string,
    newPassword: string,
) =>
    changePassword(
        await sessionInput(),
        recoveryID,
        currentKeyAttributes(),
        newPassword,
    );
