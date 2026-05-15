export interface PendingSocialInvite {
    accessKey: string;
    wallUsername: string;
}

export interface SocialInviteFriendSummary {
    fullName: string;
    username: string;
}

const pendingSocialInviteFriendKey = "socialPendingInviteFriend";
const acceptedSocialInviteFriendKey = "socialAcceptedInviteFriend";
const pendingSocialInviteKey = "socialPendingInvite";
const socialInviteAccessKeyPattern = /^[0-9A-Za-z]{12}$/;

const isPendingSocialInvite = (
    value: unknown,
): value is PendingSocialInvite => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.accessKey == "string" &&
        typeof candidate.wallUsername == "string" &&
        candidate.accessKey.trim().length > 0 &&
        candidate.wallUsername.trim().length > 0
    );
};

const isSocialInviteFriendSummary = (
    value: unknown,
): value is SocialInviteFriendSummary => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.fullName == "string" &&
        typeof candidate.username == "string" &&
        (candidate.fullName.trim().length > 0 ||
            candidate.username.trim().length > 0)
    );
};

const savedSocialInviteFriendSummary = (key: string) => {
    const saved = sessionStorage.getItem(key);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        return isSocialInviteFriendSummary(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

const saveSocialInviteFriendSummary = (
    key: string,
    friend: SocialInviteFriendSummary,
) => {
    sessionStorage.setItem(key, JSON.stringify(friend));
};

export const savePendingSocialInvite = (invite: PendingSocialInvite) => {
    sessionStorage.setItem(pendingSocialInviteKey, JSON.stringify(invite));
};

export const savedPendingSocialInvite = () => {
    const saved = sessionStorage.getItem(pendingSocialInviteKey);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        return isPendingSocialInvite(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const clearPendingSocialInvite = () => {
    sessionStorage.removeItem(pendingSocialInviteKey);
};

export const savePendingSocialInviteFriend = (
    friend: SocialInviteFriendSummary,
) => saveSocialInviteFriendSummary(pendingSocialInviteFriendKey, friend);

export const savedPendingSocialInviteFriend = () =>
    savedSocialInviteFriendSummary(pendingSocialInviteFriendKey);

export const clearPendingSocialInviteFriend = () => {
    sessionStorage.removeItem(pendingSocialInviteFriendKey);
};

export const saveAcceptedSocialInviteFriend = (
    friend: SocialInviteFriendSummary,
) => saveSocialInviteFriendSummary(acceptedSocialInviteFriendKey, friend);

export const consumeAcceptedSocialInviteFriend = () => {
    const friend = savedSocialInviteFriendSummary(
        acceptedSocialInviteFriendKey,
    );
    sessionStorage.removeItem(acceptedSocialInviteFriendKey);
    return friend;
};

export const socialInviteFromLocation = (): PendingSocialInvite | null => {
    const match = /^\/([^/]+)\/?$/.exec(window.location.pathname);
    const encodedAccessKey = window.location.hash.slice(1).trim();
    if (!match || !encodedAccessKey) return null;

    try {
        const accessKey = decodeURIComponent(encodedAccessKey).trim();
        const wallUsername = decodeURIComponent(match[1] ?? "").trim();
        return socialInviteAccessKeyPattern.test(accessKey) && wallUsername
            ? { accessKey, wallUsername }
            : null;
    } catch {
        return null;
    }
};

export const socialInviteURL = ({
    accessKey,
    wallUsername,
}: PendingSocialInvite) =>
    `${window.location.origin}/${encodeURIComponent(wallUsername)}#${encodeURIComponent(accessKey)}`;
