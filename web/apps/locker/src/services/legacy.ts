import type { LegacyContactRecord } from "ente-contacts/legacy";
import * as legacy from "ente-locker-wasm/legacy";
import { ensureAuthenticatedSession } from "./authenticated-session";

export const getInfo = async () =>
    legacy.getInfo(await ensureAuthenticatedSession());

export const publicKey = async (email: string) =>
    legacy.publicKey(await ensureAuthenticatedSession(), email);

export const verificationID = legacy.verificationID;

export const addContact = async (
    email: string,
    recoveryNoticeInDays?: number,
) =>
    legacy.addContact(
        await ensureAuthenticatedSession(),
        email,
        recoveryNoticeInDays,
    );

export const updateContact = async (
    userID: number,
    emergencyContactID: number,
    state: LegacyContactRecord["state"],
) =>
    legacy.updateContact(
        await ensureAuthenticatedSession(),
        userID,
        emergencyContactID,
        state,
    );

export const updateRecoveryNotice = async (
    emergencyContactID: number,
    recoveryNoticeInDays: number,
) =>
    legacy.updateRecoveryNotice(
        await ensureAuthenticatedSession(),
        emergencyContactID,
        recoveryNoticeInDays,
    );

export const startRecovery = async (
    userID: number,
    emergencyContactID: number,
) =>
    legacy.startRecovery(
        await ensureAuthenticatedSession(),
        userID,
        emergencyContactID,
    );

export const stopRecovery = async (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    legacy.stopRecovery(
        await ensureAuthenticatedSession(),
        recoveryID,
        userID,
        emergencyContactID,
    );

export const rejectRecovery = async (
    recoveryID: string,
    userID: number,
    emergencyContactID: number,
) =>
    legacy.rejectRecovery(
        await ensureAuthenticatedSession(),
        recoveryID,
        userID,
        emergencyContactID,
    );

export const changePassword = async (recoveryID: string, newPassword: string) =>
    legacy.changePassword(
        await ensureAuthenticatedSession(),
        recoveryID,
        newPassword,
    );
