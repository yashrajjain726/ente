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
    messages: "/app/messages",
    onboarding: "/",
    passkeysFinish: "/passkeys/finish",
    passkeysVerify: "/passkeys/verify",
    editProfileCover: "/app/profile/cover-edit",
    editProfilePhoto: "/app/profile/photo-edit",
    profile: "/app/profile",
    profileCover: "/app/profile/cover",
    profilePhoto: "/app/profile/photo",
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
