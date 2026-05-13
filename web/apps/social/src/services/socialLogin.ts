import {
    replaceSavedLocalUser,
    saveIsFirstLogin,
    saveKeyAttributes,
    saveSRPAttributes,
    updateSavedLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import { decryptBox, deriveKey } from "ente-accounts-rs/services/crypto";
import {
    saveMasterKeyInSessionAndSafeStore,
    stashKeyEncryptionKeyInSessionStore,
} from "ente-accounts-rs/services/session-storage";
import {
    getSRPAttributes,
    srpVerificationUnauthorizedErrorMessage,
    verifySRP,
} from "ente-accounts-rs/services/srp";
import {
    decryptAndStoreTokenIfNeeded,
    generateAndSaveInteractiveKeyAttributes,
} from "ente-accounts-rs/services/user";
import { saveAuthToken } from "ente-base/token";

export interface SocialLoginInput {
    email: string;
    password: string;
}

export const completeSocialLogin = async ({
    email,
    password,
}: SocialLoginInput) => {
    const cleanedEmail = email.trim();
    const srpAttributes = await getSRPAttributes(cleanedEmail);
    if (!srpAttributes) throw new Error("No account found for this email.");
    if (srpAttributes.isEmailMFAEnabled) {
        throw new Error(
            "This account requires email verification during login.",
        );
    }

    replaceSavedLocalUser({ email: cleanedEmail });
    saveSRPAttributes(srpAttributes);

    const kek = await deriveKey(
        password,
        srpAttributes.kekSalt,
        srpAttributes.opsLimit,
        srpAttributes.memLimit,
    );

    let verification;
    try {
        verification = await verifySRP(srpAttributes, kek);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message == srpVerificationUnauthorizedErrorMessage
        ) {
            throw new Error("Incorrect email or password.");
        }
        throw error;
    }

    const {
        encryptedToken,
        id,
        keyAttributes,
        passkeySessionID,
        token,
        twoFactorSessionID,
        twoFactorSessionIDV2,
    } = verification;

    const secondFactorSessionID = twoFactorSessionID || twoFactorSessionIDV2;

    if (passkeySessionID || secondFactorSessionID) {
        await stashKeyEncryptionKeyInSessionStore(kek);
        updateSavedLocalUser({
            passkeySessionID,
            twoFactorSessionID: secondFactorSessionID,
            isTwoFactorEnabled: true,
        });
        throw new Error("This account needs a second factor to sign in.");
    }

    updateSavedLocalUser({
        id,
        token,
        encryptedToken,
        isTwoFactorEnabled: undefined,
        twoFactorSessionID: undefined,
        passkeySessionID: undefined,
    });
    if (token) await saveAuthToken(token);
    if (!keyAttributes) {
        throw new Error("This account has not finished setup.");
    }

    saveIsFirstLogin();
    saveKeyAttributes(keyAttributes);

    const masterKey = await decryptBox(
        {
            encryptedData: keyAttributes.encryptedKey,
            nonce: keyAttributes.keyDecryptionNonce,
        },
        kek,
    );
    const updatedKeyAttributes = await generateAndSaveInteractiveKeyAttributes(
        password,
        keyAttributes,
        masterKey,
    );
    await saveMasterKeyInSessionAndSafeStore(masterKey);
    await decryptAndStoreTokenIfNeeded(updatedKeyAttributes, masterKey);

    return { email: cleanedEmail };
};
