export interface PendingSpaceInvite {
    accessKey: string;
    spaceUsername: string;
}

export interface SpaceInviteFriendSummary {
    fullName: string;
    username: string;
}

const pendingSpaceInviteFriendKey = "spacePendingInviteFriend";
const acceptedSpaceInviteFriendKey = "spaceAcceptedInviteFriend";
const pendingSpaceInviteKey = "spacePendingInvite";
const spaceInviteAccessKeyPattern = /^[0-9A-Za-z]{12}$/;

const isPendingSpaceInvite = (value: unknown): value is PendingSpaceInvite => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.accessKey == "string" &&
        typeof candidate.spaceUsername == "string" &&
        candidate.accessKey.trim().length > 0 &&
        candidate.spaceUsername.trim().length > 0
    );
};

const isSpaceInviteFriendSummary = (
    value: unknown,
): value is SpaceInviteFriendSummary => {
    if (!value || typeof value != "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.fullName == "string" &&
        typeof candidate.username == "string" &&
        (candidate.fullName.trim().length > 0 ||
            candidate.username.trim().length > 0)
    );
};

const savedSpaceInviteFriendSummary = (key: string) => {
    const saved = sessionStorage.getItem(key);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        return isSpaceInviteFriendSummary(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

const saveSpaceInviteFriendSummary = (
    key: string,
    friend: SpaceInviteFriendSummary,
) => {
    sessionStorage.setItem(key, JSON.stringify(friend));
};

export const savePendingSpaceInvite = (invite: PendingSpaceInvite) => {
    sessionStorage.setItem(pendingSpaceInviteKey, JSON.stringify(invite));
};

export const savedPendingSpaceInvite = () => {
    const saved = sessionStorage.getItem(pendingSpaceInviteKey);
    if (!saved) return undefined;

    try {
        const parsed: unknown = JSON.parse(saved);
        return isPendingSpaceInvite(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const clearPendingSpaceInvite = () => {
    sessionStorage.removeItem(pendingSpaceInviteKey);
};

export const savePendingSpaceInviteFriend = (
    friend: SpaceInviteFriendSummary,
) => saveSpaceInviteFriendSummary(pendingSpaceInviteFriendKey, friend);

export const savedPendingSpaceInviteFriend = () =>
    savedSpaceInviteFriendSummary(pendingSpaceInviteFriendKey);

export const clearPendingSpaceInviteFriend = () => {
    sessionStorage.removeItem(pendingSpaceInviteFriendKey);
};

export const saveAcceptedSpaceInviteFriend = (
    friend: SpaceInviteFriendSummary,
) => saveSpaceInviteFriendSummary(acceptedSpaceInviteFriendKey, friend);

export const consumeAcceptedSpaceInviteFriend = () => {
    const friend = savedSpaceInviteFriendSummary(acceptedSpaceInviteFriendKey);
    sessionStorage.removeItem(acceptedSpaceInviteFriendKey);
    return friend;
};

export const spaceInviteFromLocation = (): PendingSpaceInvite | null => {
    const match = /^\/([^/]+)\/?$/.exec(window.location.pathname);
    const encodedAccessKey = window.location.hash.slice(1).trim();
    if (!match || !encodedAccessKey) return null;

    try {
        const accessKey = decodeURIComponent(encodedAccessKey).trim();
        const spaceUsername = decodeURIComponent(match[1] ?? "").trim();
        return spaceInviteAccessKeyPattern.test(accessKey) && spaceUsername
            ? { accessKey, spaceUsername }
            : null;
    } catch {
        return null;
    }
};

export const spaceInviteURL = ({
    accessKey,
    spaceUsername,
}: PendingSpaceInvite) =>
    `${window.location.origin}/${encodeURIComponent(spaceUsername)}#${encodeURIComponent(accessKey)}`;
