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
    encryptBox,
    fromB64,
    fromB64URLSafeNoPadding,
    generateKey,
    toB64,
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

interface LoginKDFAttributes {
    kekSalt: string;
    memLimit: number;
    opsLimit: number;
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

const pendingSocialLoginCredentialsKey = "socialPendingLoginCredentials";

const cleanedEmail = (email: string) => email.trim();

const deriveLoginKEK = (
    password: string,
    { kekSalt, memLimit, opsLimit }: LoginKDFAttributes,
) => deriveKey(password, kekSalt, opsLimit, memLimit);

const isSocialLoginInput = (value: unknown): value is SocialLoginInput => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.email == "string" &&
        typeof candidate.password == "string"
    );
};

const encodeCredentials = (credentials: SocialLoginInput) =>
    toB64(new TextEncoder().encode(JSON.stringify(credentials)));

const decodeCredentials = async (encodedCredentials: string) => {
    const parsed: unknown = JSON.parse(
        new TextDecoder().decode(await fromB64(encodedCredentials)),
    );
    return isSocialLoginInput(parsed) ? parsed : undefined;
};

export const savePendingSocialLoginCredentials = async (
    credentials: SocialLoginInput,
) => {
    const key = await generateKey();
    const box = await encryptBox(await encodeCredentials(credentials), key);
    sessionStorage.setItem(
        pendingSocialLoginCredentialsKey,
        JSON.stringify({ key, ...box }),
    );
};

export const savedPendingSocialLoginCredentials = async () => {
    const saved = sessionStorage.getItem(pendingSocialLoginCredentialsKey);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed != "object") return undefined;
        const {
            encryptedData,
            key,
            nonce,
        } = parsed as Record<string, unknown>;
        if (
            typeof encryptedData != "string" ||
            typeof key != "string" ||
            typeof nonce != "string"
        ) {
            return undefined;
        }

        return await decodeCredentials(
            await decryptBox({ encryptedData, nonce }, key),
        );
    } catch {
        return undefined;
    }
};

export const clearPendingSocialLoginCredentials = () => {
    sessionStorage.removeItem(pendingSocialLoginCredentialsKey);
};

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
    clearPendingSocialLoginCredentials();
    const srpAttributes = await getSRPAttributes(emailForLogin);

    if (!srpAttributes) {
        await sendOTT(emailForLogin, "login");
        replaceSavedLocalUser({ email: emailForLogin });
        await savePendingSocialLoginCredentials({
            email: emailForLogin,
            password,
        });
        return { status: "email-otp", email: emailForLogin };
    }

    replaceSavedLocalUser({ email: emailForLogin });
    saveSRPAttributes(srpAttributes);

    if (srpAttributes.isEmailMFAEnabled) {
        await sendOTT(emailForLogin, "login");
        await savePendingSocialLoginCredentials({
            email: emailForLogin,
            password,
        });
        return { status: "email-otp", email: emailForLogin };
    }

    clearPendingSocialLoginCredentials();
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
    const verification = await verifyEmail(emailForLogin, code, undefined);

    if (!srpAttributes) {
        return finishSocialLoginVerification({
            email: emailForLogin,
            password,
            verification,
        });
    }

    saveSRPAttributes(srpAttributes);
    return finishSocialLoginVerification({
        email: emailForLogin,
        kek: await deriveLoginKEK(password, srpAttributes),
        password,
        verification,
    });
};

export const resendSocialLoginCode = (email: string) =>
    sendOTT(email.trim(), "login");

interface FinishSocialLoginVerificationInput {
    email: string;
    kek?: string;
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
        if (kek) await stashKeyEncryptionKeyInSessionStore(kek);
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
        if (kek) await stashKeyEncryptionKeyInSessionStore(kek);
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

    const loginKEK =
        kek ??
        (password ? await deriveLoginKEK(password, keyAttributes) : undefined);
    if (!loginKEK) {
        throw new Error("Login session expired. Please sign in again.");
    }

    await saveCompletedSocialLogin({
        keyAttributes,
        kek: loginKEK,
        password,
    });
    clearPendingSocialLoginCredentials();

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
    const [stashedKEK, pendingCredentials] = await Promise.all([
        unstashKeyEncryptionKeyFromSession(),
        savedPendingSocialLoginCredentials(),
    ]);
    const kek =
        stashedKEK ??
        (pendingCredentials
            ? await deriveLoginKEK(pendingCredentials.password, keyAttributes)
            : undefined);
    if (!kek) throw new Error("Login session expired. Please sign in again.");

    updateSavedLocalUser({
        id,
        token: undefined,
        encryptedToken,
        isTwoFactorEnabled: undefined,
        twoFactorSessionID: undefined,
        passkeySessionID: undefined,
    });
    await saveCompletedSocialLogin({
        keyAttributes,
        kek,
        password: pendingCredentials?.password,
    });
    clearPendingSocialLoginCredentials();

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
