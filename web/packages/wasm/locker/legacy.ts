import type { LegacyContactState, Session } from "./pkg/ente_locker_wasm";

const wasm = () => import("./pkg/ente_locker_wasm");

export const createLegacyService = (getSession: () => Promise<Session>) => ({
    getInfo: async () => (await wasm()).legacyGetInfo(await getSession()),

    publicKey: async (email: string) =>
        (await wasm()).legacyPublicKey(await getSession(), email),

    verificationID: async (email: string) => {
        const api = await wasm();
        const key = await api.legacyPublicKey(await getSession(), email);
        return key ? api.legacyVerificationID(key) : undefined;
    },

    addContact: async (email: string, recoveryNoticeInDays?: number) =>
        (await wasm()).legacyAddContact(
            await getSession(),
            email,
            recoveryNoticeInDays,
        ),

    updateContact: async (
        userID: number,
        emergencyContactID: number,
        state: LegacyContactState,
    ) =>
        (await wasm()).legacyUpdateContact(
            await getSession(),
            BigInt(userID),
            BigInt(emergencyContactID),
            state,
        ),

    updateRecoveryNotice: async (
        emergencyContactID: number,
        recoveryNoticeInDays: number,
    ) =>
        (await wasm()).legacyUpdateRecoveryNotice(
            await getSession(),
            BigInt(emergencyContactID),
            recoveryNoticeInDays,
        ),

    startRecovery: async (userID: number, emergencyContactID: number) =>
        (await wasm()).legacyStartRecovery(
            await getSession(),
            BigInt(userID),
            BigInt(emergencyContactID),
        ),

    stopRecovery: async (
        recoveryID: string,
        userID: number,
        emergencyContactID: number,
    ) =>
        (await wasm()).legacyStopRecovery(
            await getSession(),
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),

    rejectRecovery: async (
        recoveryID: string,
        userID: number,
        emergencyContactID: number,
    ) =>
        (await wasm()).legacyRejectRecovery(
            await getSession(),
            recoveryID,
            BigInt(userID),
            BigInt(emergencyContactID),
        ),

    changePassword: async (recoveryID: string, newPassword: string) =>
        (await wasm()).legacyChangePassword(
            await getSession(),
            recoveryID,
            newPassword,
        ),
});
