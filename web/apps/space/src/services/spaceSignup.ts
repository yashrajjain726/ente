import {
    replaceSavedLocalUser,
    savedOriginalKeyAttributes,
    saveIsFirstLogin,
    saveJustSignedUp,
    saveKeyAttributes,
    saveOriginalKeyAttributes,
    stashReferralSource,
    stashSRPSetupAttributes,
    unstashAfterUseSRPSetupAttributes,
    unstashReferralSource,
} from "ente-accounts-rs/services/accounts-db";
import {
    generateSRPSetupAttributes,
    getAndSaveSRPAttributes,
    setupSRP,
} from "ente-accounts-rs/services/srp";
import {
    decryptAndStoreTokenIfNeeded,
    generateAndSaveInteractiveKeyAttributes,
    generateKeysAndAttributes,
    putUserKeyAttributes,
    sendOTT,
    verifyEmail,
} from "ente-accounts-rs/services/user";
import { isMuseumHTTPError } from "ente-base/http";
import { saveAuthToken } from "ente-base/token";
import { createSpaceBrowserSession } from "services/spacePersistentSession";
import {
    masterKeyFromSpaceSession,
    saveMasterKeyInSpaceSession,
} from "services/spaceSecureSessionStorage";

export interface SpaceSignupInput {
    email: string;
    password: string;
    referralSource: string;
}

export const beginSpaceSignup = async ({
    email,
    password,
    referralSource,
}: SpaceSignupInput) => {
    const cleanedEmail = email.trim();
    const cleanedReferralSource = referralSource.trim();
    unstashReferralSource();
    if (cleanedReferralSource) stashReferralSource(cleanedReferralSource);

    await sendOTT(cleanedEmail, "signup");
    replaceSavedLocalUser({ email: cleanedEmail });

    const { masterKey, kek, keyAttributes } =
        await generateKeysAndAttributes(password);
    saveOriginalKeyAttributes(keyAttributes);
    stashSRPSetupAttributes(await generateSRPSetupAttributes(kek));
    await generateAndSaveInteractiveKeyAttributes(
        password,
        keyAttributes,
        masterKey,
    );
    await saveMasterKeyInSpaceSession(masterKey);
    saveJustSignedUp();

    return { email: cleanedEmail };
};

export const completeSpaceSignup = async (email: string, code: string) => {
    const referralSource = unstashReferralSource();
    const cleanedReferralSource = referralSource
        ? `web:${referralSource}`
        : undefined;
    const {
        keyAttributes,
        encryptedToken,
        token,
        id,
        twoFactorSessionID,
        passkeySessionID,
    } = await verifyEmail(email, code, cleanedReferralSource);

    if (passkeySessionID || twoFactorSessionID) {
        throw new Error("Unexpected second factor during signup");
    }

    if (token) await saveAuthToken(token);
    replaceSavedLocalUser({ id, email, token, encryptedToken });

    if (keyAttributes) {
        saveKeyAttributes(keyAttributes);
        saveOriginalKeyAttributes(keyAttributes);
        const masterKey = await masterKeyFromSpaceSession();
        if (!token && encryptedToken && masterKey) {
            await decryptAndStoreTokenIfNeeded(keyAttributes, masterKey);
        }
    } else {
        const originalKeyAttributes = savedOriginalKeyAttributes();
        if (originalKeyAttributes) {
            await putUserKeyAttributes(originalKeyAttributes);
            const masterKey = await masterKeyFromSpaceSession();
            if (!token && encryptedToken && masterKey) {
                await decryptAndStoreTokenIfNeeded(
                    originalKeyAttributes,
                    masterKey,
                );
            }
        }
        await unstashAfterUseSRPSetupAttributes(setupSRP);
        await getAndSaveSRPAttributes(email);
    }

    const masterKey = await masterKeyFromSpaceSession();
    if (!masterKey) throw new Error("Signup session expired. Please sign in.");
    await createSpaceBrowserSession(masterKey);
    saveIsFirstLogin();
};

export const resendSpaceSignupCode = (email: string) =>
    sendOTT(email.trim(), "signup");

export const spaceSignupErrorMessage = async (error: unknown) => {
    if (await isMuseumHTTPError(error, 409, "USER_ALREADY_REGISTERED")) {
        return "This email already has an account. Please sign in.";
    }
    return error instanceof Error
        ? error.message
        : "Couldn't create account. Please try again.";
};
