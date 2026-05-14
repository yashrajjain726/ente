export interface PendingSocialPasskeyVerification {
    hasTwoFactorFallback: boolean;
    passkeySessionID: string;
    url: string;
}

const pendingSocialPasskeyVerificationKey = "socialPendingPasskeyVerification";
const autoOpenedSocialPasskeyPrefix = "socialPasskeyAutoOpened:";

const isPendingSocialPasskeyVerification = (
    value: unknown,
): value is PendingSocialPasskeyVerification => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.hasTwoFactorFallback == "boolean" &&
        typeof candidate.passkeySessionID == "string" &&
        typeof candidate.url == "string"
    );
};

export const savePendingSocialPasskeyVerification = (
    verification: PendingSocialPasskeyVerification,
) => {
    sessionStorage.setItem(
        pendingSocialPasskeyVerificationKey,
        JSON.stringify(verification),
    );
};

export const savedPendingSocialPasskeyVerification = () => {
    const saved = sessionStorage.getItem(pendingSocialPasskeyVerificationKey);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        return isPendingSocialPasskeyVerification(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const clearPendingSocialPasskeyVerification = () => {
    sessionStorage.removeItem(pendingSocialPasskeyVerificationKey);
};

const autoOpenedSocialPasskeyKey = (passkeySessionID: string) =>
    `${autoOpenedSocialPasskeyPrefix}${passkeySessionID}`;

export const hasAutoOpenedSocialPasskeyVerification = (
    passkeySessionID: string,
) =>
    sessionStorage.getItem(autoOpenedSocialPasskeyKey(passkeySessionID)) == "1";

export const markAutoOpenedSocialPasskeyVerification = (
    passkeySessionID: string,
) => {
    sessionStorage.setItem(autoOpenedSocialPasskeyKey(passkeySessionID), "1");
};
