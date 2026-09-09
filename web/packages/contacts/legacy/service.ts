import { savedKeyAttributes } from "ente-accounts/services/accounts-db";
import {
    addContact,
    changePassword,
    publicKey,
    verificationID,
    type Session,
} from "ente-legacy-wasm/authenticated";

export const legacyVerificationID = async (session: Session, email: string) => {
    const key = await publicKey(session, email);
    return key ? verificationID(key) : undefined;
};

export const legacyAddContact = (
    session: Session,
    email: string,
    recoveryNoticeInDays?: number,
) => addContact(session, email, currentKeyAttributes(), recoveryNoticeInDays);

export const legacyChangePassword = (
    session: Session,
    recoveryID: string,
    newPassword: string,
) => changePassword(session, recoveryID, newPassword);

const currentKeyAttributes = () => {
    const keyAttributes = savedKeyAttributes();
    if (!keyAttributes) {
        throw new Error("Missing current key attributes");
    }
    return keyAttributes;
};
