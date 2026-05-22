export type SetupProfileSource = "login" | "verify";
export type VerifyFlow = "login" | "signup";

const valueFromQuery = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

export const spaceRoutes = {
    friend: (spaceId: string) => `/app/friends/${encodeURIComponent(spaceId)}`,
    friends: "/app/friends",
    home: "/app",
    invite: "/invite",
    login: "/login",
    notifications: "/app/notifications",
    onboarding: "/",
    passkeysFinish: "/passkeys/finish",
    passkeysVerify: "/passkeys/verify",
    editProfilePhoto: "/app/profile/photo",
    profile: "/app/profile",
    settings: "/app/settings",
    setupProfile: (from?: SetupProfileSource) =>
        from == "login" ? "/setup-profile?from=login" : "/setup-profile",
    signup: "/signup",
    twoFactorVerify: "/two-factor/verify",
    unlock: "/unlock",
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

export const friendSpaceIdFromQuery = (value: string | string[] | undefined) =>
    valueFromQuery(value) ?? "";
