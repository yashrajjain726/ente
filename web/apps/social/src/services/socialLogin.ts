import {
    replaceSavedLocalUser,
    savedPartialLocalUser,
    savedSRPAttributes,
    saveIsFirstLogin,
    saveKeyAttributes,
    saveOriginalKeyAttributes,
    saveSRPAttributes,
    updateSavedLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import {
    decryptBox,
    deriveKey,
    fromB64URLSafeNoPadding,
} from "ente-accounts-rs/services/crypto";
import {
    checkPasskeyVerificationStatus,
    clearInflightPasskeySessionID,
    passkeySessionExpiredErrorMessage,
} from "ente-accounts-rs/services/passkey";
import {
    saveMasterKeyInSessionAndSafeStore,
    stashKeyEncryptionKeyInSessionStore,
    unstashKeyEncryptionKeyFromSession,
} from "ente-accounts-rs/services/session-storage";
import {
    getSRPAttributes,
    type SRPAttributes,
    srpVerificationUnauthorizedErrorMessage,
    verifySRP,
} from "ente-accounts-rs/services/srp";
import {
    decryptAndStoreTokenIfNeeded,
    type EmailOrSRPVerificationResponse,
    generateAndSaveInteractiveKeyAttributes,
    sendOTT,
    TwoFactorAuthorizationResponse,
    verifyEmail,
    verifyTwoFactor,
} from "ente-accounts-rs/services/user";
import { clientPackageName } from "ente-base/app";
import { saveAuthToken } from "ente-base/token";
import { nullToUndefined } from "ente-utils/transform";

export interface SocialLoginInput {
    email: string;
    password: string;
}

export type SocialLoginResult =
    | { status: "complete"; email: string }
    | { status: "email-otp"; email: string }
    | { status: "totp"; email: string }
    | {
          accountsUrl: string;
          hasTwoFactorFallback: boolean;
          passkeySessionID: string;
          status: "passkey";
          url: string;
      };

export type SocialLoginPasskeyStatusResult =
    | SocialLoginResult
    | { status: "pending" };

export const socialLoginPasskeySessionExpiredErrorMessage =
    passkeySessionExpiredErrorMessage;

const cleanedEmail = (email: string) => email.trim();

const deriveLoginKEK = (
    password: string,
    { kekSalt, memLimit, opsLimit }: SRPAttributes,
) => deriveKey(password, kekSalt, opsLimit, memLimit);

const socialPasskeyVerificationRedirectURL = (
    accountsURL: string,
    passkeySessionID: string,
) => {
    const redirect = `${window.location.origin}/passkeys/finish`;
    const params = new URLSearchParams({
        clientPackage: clientPackageName,
        passkeySessionID,
        redirect,
    });
    return `${accountsURL}/passkeys/verify?${params.toString()}`;
};

export const beginSocialLogin = async ({
    email,
    password,
}: SocialLoginInput): Promise<SocialLoginResult> => {
    const emailForLogin = cleanedEmail(email);
    const srpAttributes = await getSRPAttributes(emailForLogin);
    if (!srpAttributes) throw new Error("No account found for this email.");

    replaceSavedLocalUser({ email: emailForLogin });
    saveSRPAttributes(srpAttributes);

    if (srpAttributes.isEmailMFAEnabled) {
        await sendOTT(emailForLogin, "login");
        return { status: "email-otp", email: emailForLogin };
    }

    const kek = await deriveLoginKEK(password, srpAttributes);

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

    return finishSocialLoginVerification({
        email: emailForLogin,
        kek,
        password,
        verification,
    });
};

export const completeSocialLoginEmailVerification = async ({
    code,
    email,
    password,
}: SocialLoginInput & { code: string }): Promise<SocialLoginResult> => {
    const emailForLogin = cleanedEmail(email);
    const srpAttributes =
        savedSRPAttributes() ?? (await getSRPAttributes(emailForLogin));
    if (!srpAttributes) throw new Error("No account found for this email.");

    saveSRPAttributes(srpAttributes);
    const kek = await deriveLoginKEK(password, srpAttributes);
    const verification = await verifyEmail(emailForLogin, code, undefined);

    return finishSocialLoginVerification({
        email: emailForLogin,
        kek,
        password,
        verification,
    });
};

export const resendSocialLoginCode = (email: string) =>
    sendOTT(email.trim(), "login");

interface FinishSocialLoginVerificationInput {
    email: string;
    kek: string;
    password?: string;
    verification: EmailOrSRPVerificationResponse;
}

const finishSocialLoginVerification = async ({
    email,
    kek,
    password,
    verification,
}: FinishSocialLoginVerificationInput): Promise<SocialLoginResult> => {
    const {
        accountsUrl,
        encryptedToken,
        id,
        keyAttributes,
        passkeySessionID,
        token,
        twoFactorSessionID,
        twoFactorSessionIDV2,
    } = verification;

    const secondFactorSessionID = twoFactorSessionID || twoFactorSessionIDV2;

    if (passkeySessionID) {
        if (!accountsUrl) {
            throw new Error("Passkey verification URL is missing.");
        }
        await stashKeyEncryptionKeyInSessionStore(kek);
        updateSavedLocalUser({
            passkeySessionID,
            twoFactorSessionID: secondFactorSessionID,
            isTwoFactorEnabled: true,
        });
        saveIsFirstLogin();
        return {
            accountsUrl,
            hasTwoFactorFallback: Boolean(secondFactorSessionID),
            passkeySessionID,
            status: "passkey",
            url: socialPasskeyVerificationRedirectURL(
                accountsUrl,
                passkeySessionID,
            ),
        };
    }

    if (secondFactorSessionID) {
        await stashKeyEncryptionKeyInSessionStore(kek);
        updateSavedLocalUser({
            passkeySessionID: undefined,
            twoFactorSessionID: secondFactorSessionID,
            isTwoFactorEnabled: true,
        });
        saveIsFirstLogin();
        return { status: "totp", email };
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

    await saveCompletedSocialLogin({ keyAttributes, kek, password });

    return { status: "complete", email };
};

export const completeSocialLoginSecondFactor = async (
    code: string,
    sessionID: string,
): Promise<SocialLoginResult> => {
    const response = await verifyTwoFactor(code, sessionID);
    return finishSocialLoginAuthorization(response);
};

export const completeSocialLoginPasskey = async (
    passkeySessionID: string,
    response: string,
): Promise<SocialLoginResult> => {
    const inflightPasskeySessionID = nullToUndefined(
        sessionStorage.getItem("inflightPasskeySessionID"),
    );
    if (
        !inflightPasskeySessionID ||
        inflightPasskeySessionID != passkeySessionID
    ) {
        throw new Error("Unexpected passkey verification response.");
    }

    clearInflightPasskeySessionID();
    return finishSocialLoginAuthorization(
        TwoFactorAuthorizationResponse.parse(
            JSON.parse(
                new TextDecoder().decode(
                    await fromB64URLSafeNoPadding(response),
                ),
            ),
        ),
    );
};

export const checkSocialLoginPasskeyStatus = async (
    passkeySessionID: string,
): Promise<SocialLoginPasskeyStatusResult> => {
    const response = await checkPasskeyVerificationStatus(passkeySessionID);
    if (!response) return { status: "pending" };

    clearInflightPasskeySessionID();
    return finishSocialLoginAuthorization(response);
};

export const useSocialLoginTwoFactorInstead = () => {
    clearInflightPasskeySessionID();
    updateSavedLocalUser({ passkeySessionID: undefined });
};

const finishSocialLoginAuthorization = async ({
    encryptedToken,
    id,
    keyAttributes,
}: TwoFactorAuthorizationResponse): Promise<SocialLoginResult> => {
    const kek = await unstashKeyEncryptionKeyFromSession();
    if (!kek) throw new Error("Login session expired. Please sign in again.");

    updateSavedLocalUser({
        id,
        token: undefined,
        encryptedToken,
        isTwoFactorEnabled: undefined,
        twoFactorSessionID: undefined,
        passkeySessionID: undefined,
    });
    await saveCompletedSocialLogin({ keyAttributes, kek });

    return { status: "complete", email: savedPartialLocalUser()?.email ?? "" };
};

const saveCompletedSocialLogin = async ({
    keyAttributes,
    kek,
    password,
}: {
    keyAttributes: EmailOrSRPVerificationResponse["keyAttributes"];
    kek: string;
    password?: string;
}) => {
    if (!keyAttributes) {
        throw new Error("This account has not finished setup.");
    }

    saveIsFirstLogin();
    saveKeyAttributes(keyAttributes);
    saveOriginalKeyAttributes(keyAttributes);

    const masterKey = await decryptBox(
        {
            encryptedData: keyAttributes.encryptedKey,
            nonce: keyAttributes.keyDecryptionNonce,
        },
        kek,
    );
    const tokenKeyAttributes = password
        ? await generateAndSaveInteractiveKeyAttributes(
              password,
              keyAttributes,
              masterKey,
          )
        : keyAttributes;
    await saveMasterKeyInSessionAndSafeStore(masterKey);
    await decryptAndStoreTokenIfNeeded(tokenKeyAttributes, masterKey);
};
