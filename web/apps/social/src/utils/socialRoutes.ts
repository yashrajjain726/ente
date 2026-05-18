export type SetupProfileSource = "login" | "verify";
export type FriendProfileSource = "friends" | "home" | "profile";
export type VerifyFlow = "login" | "signup";

export const onboardingSourceSearchParam = "onboardingSource";
export const addFriendLinkOnboardingSource = "add-friend-link";

const valueFromQuery = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

export const socialRoutes = {
    friend: (friendID: string, from: FriendProfileSource) =>
        `/app/friend?friendID=${encodeURIComponent(friendID)}&from=${from}`,
    friends: "/app/friends",
    home: "/app",
    invite: "/invite",
    login: "/login",
    notifications: "/app/notifications",
    onboarding: "/",
    passkeysFinish: "/passkeys/finish",
    passkeysVerify: "/passkeys/verify",
    profile: "/app/profile",
    settings: "/app/settings",
    setupProfile: (from: SetupProfileSource = "verify") =>
        `/setup-profile?from=${from}`,
    signup: "/signup",
    twoFactorVerify: "/two-factor/verify",
    verify: "/verify",
    verifyLogin: "/verify?flow=login",
} as const;

export const verifyFlowFromQuery = (
    value: string | string[] | undefined,
): VerifyFlow => (valueFromQuery(value) == "login" ? "login" : "signup");

export const setupProfileSourceFromQuery = (
    value: string | string[] | undefined,
): SetupProfileSource =>
    valueFromQuery(value) == "login" ? "login" : "verify";

export const friendProfileSourceFromQuery = (
    value: string | string[] | undefined,
): FriendProfileSource => {
    const from = valueFromQuery(value);
    return from == "home" || from == "profile" || from == "friends"
        ? from
        : "friends";
};

export const friendIDFromQuery = (value: string | string[] | undefined) =>
    valueFromQuery(value) ?? "";
