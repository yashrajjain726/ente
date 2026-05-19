import {
    savedKeyAttributes,
    savedLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import { masterKeyFromSession } from "ente-accounts-rs/services/session-storage";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin, apiURL } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import type { WallAccountCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type {
    SetupProfile,
    SetupProfileInput,
} from "screens/SetupProfileScreen";

const usernamePattern = /^[a-z0-9][a-z0-9._-]*$/;
const minUsernameLength = 3;
const maxUsernameLength = 30;

interface WallAvatar {
    objectKey: string;
    size?: number;
    updatedAt?: string;
}

interface OwnedWall {
    wallId: string;
    wallSlug: string;
}

interface CreatedWall {
    wallId: string;
    wallSlug: string;
}

interface WallLookup {
    wallId: string;
    wallSlug: string;
}

interface DecryptedWallProfile {
    wallId: string;
    wallSlug: string;
    profile: string;
    avatar?: WallAvatar;
    updatedAt?: string;
}

interface UpdateWallProfileResponse {
    avatar?: WallAvatar;
}

interface WallProfilePayload {
    displayName?: unknown;
    fullName?: unknown;
    username?: unknown;
}

export type UsernameAvailability = "available" | "taken";

export const normalizeSocialUsername = (username: string) =>
    username.trim().toLowerCase();

export const socialUsernameValidationError = (username: string) => {
    const normalized = normalizeSocialUsername(username);
    if (normalized.length < minUsernameLength) {
        return "Username must be at least 3 characters.";
    }
    if (normalized.length > maxUsernameLength) {
        return "Username must be 30 characters or less.";
    }
    if (!usernamePattern.test(normalized)) {
        return "Use lowercase letters, numbers, dots, dashes, or underscores.";
    }
    if (normalized.startsWith("ente")) {
        return "This username is reserved.";
    }
    return undefined;
};

const wallProfilePayloadFor = (profile: SetupProfileInput) =>
    JSON.stringify({
        displayName: profile.fullName.trim(),
        fullName: profile.fullName.trim(),
        username: normalizeSocialUsername(profile.username),
    });

const parseWallProfilePayload = (profile: string): WallProfilePayload => {
    if (!profile.trim()) return {};
    try {
        const parsed: unknown = JSON.parse(profile);
        return parsed && typeof parsed == "object"
            ? (parsed as WallProfilePayload)
            : {};
    } catch {
        return {};
    }
};

const textField = (value: unknown) =>
    typeof value == "string" ? value.trim() : "";

const wallHTTPStatus = (error: unknown) => {
    if (!error || typeof error != "object" || !("status" in error)) {
        return undefined;
    }
    const { status } = error as { status?: unknown };
    return typeof status == "number" ? status : undefined;
};

const defaultOwnedWall = (walls: OwnedWall[]) => walls[0];

export const openCurrentWallContext = async () => {
    const [authToken, baseUrl, masterKeyB64] = await Promise.all([
        savedAuthToken(),
        apiOrigin(),
        masterKeyFromSession(),
    ]);
    const user = savedLocalUser();
    const keyAttributes = savedKeyAttributes();

    if (!authToken || !masterKeyB64 || !user || !keyAttributes) {
        return undefined;
    }

    const { wall_open_account_ctx } = await loadEnteWasm();
    return await wall_open_account_ctx({
        authToken,
        baseUrl,
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
        keyAttributes,
        masterKeyB64,
        publicKeyB64: keyAttributes.publicKey,
        userId: user.id,
    });
};

export const ensureCurrentWallContext = async () => {
    const ctx = await openCurrentWallContext();
    if (!ctx) throw new Error("Please sign in again.");
    return ctx;
};

const avatarURLForRemoteAvatar = async (
    ctx: WallAccountCtxHandle,
    wallId: string,
    avatar: WallAvatar | undefined,
) => {
    if (!avatar?.objectKey) return null;
    const bytes = await ctx.download_wall_avatar(wallId, avatar.objectKey);
    return URL.createObjectURL(new Blob([bytes]));
};

const profileFromDecryptedWallProfile = (
    wallProfile: DecryptedWallProfile,
): SetupProfile => {
    const payload = parseWallProfilePayload(wallProfile.profile);
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        wallProfile.wallSlug;

    return {
        avatarObjectKey: wallProfile.avatar?.objectKey,
        avatarUpdatedAt: wallProfile.avatar?.updatedAt,
        avatarUrl: null,
        fullName,
        username: wallProfile.wallSlug,
        wallId: wallProfile.wallId,
        wallSlug: wallProfile.wallSlug,
    };
};

export const loadExistingSocialProfile = async () => {
    const ctx = await openCurrentWallContext();
    if (!ctx) return null;

    try {
        const walls = (await ctx.list_owned_walls()) as OwnedWall[];
        const wall = defaultOwnedWall(walls);
        if (!wall) return null;

        const wallProfile = (await ctx.get_wall_profile(
            wall.wallId,
        )) as DecryptedWallProfile;
        return profileFromDecryptedWallProfile(wallProfile);
    } finally {
        ctx.free();
    }
};

export const loadExistingSocialAvatar = async (
    wallId: string | undefined,
    avatarObjectKey: string | undefined,
) => {
    if (!wallId || !avatarObjectKey) return null;

    const ctx = await openCurrentWallContext();
    if (!ctx) return null;

    try {
        return await avatarURLForRemoteAvatar(ctx, wallId, {
            objectKey: avatarObjectKey,
        });
    } finally {
        ctx.free();
    }
};

export const socialUsernameAvailability = async (
    username: string,
): Promise<UsernameAvailability> => {
    const validationError = socialUsernameValidationError(username);
    if (validationError) return "taken";

    const slug = normalizeSocialUsername(username);
    const response = await fetch(
        await apiURL(
            `/wall/public/slug-availability/${encodeURIComponent(slug)}`,
        ),
    );
    if (!response.ok) {
        throw new Error("Username availability check failed.");
    }
    const { available } = (await response.json()) as { available?: unknown };
    return available === true ? "available" : "taken";
};

export const saveSocialProfile = async (
    profile: SetupProfileInput,
): Promise<SetupProfile> => {
    const username = normalizeSocialUsername(profile.username);
    const usernameError = socialUsernameValidationError(username);
    if (usernameError) throw new Error(usernameError);

    const ctx = await ensureCurrentWallContext();
    try {
        const walls = (await ctx.list_owned_walls()) as OwnedWall[];
        const existingWall =
            (profile.wallId &&
                walls.find((wall) => wall.wallId == profile.wallId)) ||
            defaultOwnedWall(walls);
        const profilePayload = wallProfilePayloadFor({ ...profile, username });

        let wallId: string;
        let wallSlug = username;
        let updateResponse: UpdateWallProfileResponse | undefined;

        if (existingWall) {
            wallId = existingWall.wallId;
            wallSlug = existingWall.wallSlug;
            if (normalizeSocialUsername(wallSlug) != username) {
                const updatedSlug = (await ctx.update_wall_slug(
                    wallId,
                    username,
                )) as WallLookup;
                wallSlug = updatedSlug.wallSlug;
            }
        } else {
            const created = (await ctx.create_wall(
                username,
                profilePayload,
            )) as CreatedWall;
            wallId = created.wallId;
            wallSlug = created.wallSlug;
        }

        let avatarUrl: string | null = null;
        if (profile.avatarFile) {
            const avatarBytes = new Uint8Array(
                await profile.avatarFile.arrayBuffer(),
            );
            updateResponse = (await ctx.update_wall_profile_with_avatar(
                wallId,
                profilePayload,
                avatarBytes,
            )) as UpdateWallProfileResponse;
            avatarUrl = URL.createObjectURL(profile.avatarFile);
        } else if (existingWall) {
            updateResponse = (await ctx.update_wall_profile(
                wallId,
                profilePayload,
            )) as UpdateWallProfileResponse;
            avatarUrl = profile.avatarUrl;
        }

        return {
            avatarObjectKey:
                updateResponse?.avatar?.objectKey ?? profile.avatarObjectKey,
            avatarUpdatedAt:
                updateResponse?.avatar?.updatedAt ?? profile.avatarUpdatedAt,
            avatarUrl,
            fullName: profile.fullName.trim(),
            username: wallSlug,
            wallId,
            wallSlug,
        };
    } catch (error) {
        if (wallHTTPStatus(error) == 409) {
            throw new Error("This username is already taken.");
        }
        throw error;
    } finally {
        ctx.free();
    }
};

export const socialProfileErrorMessage = (error: unknown) => {
    const status = wallHTTPStatus(error);
    if (status == 409) return "This username is already taken.";
    if (status == 400) {
        const message = error instanceof Error ? error.message : "";
        if (message.toLowerCase().includes("reserved")) {
            return "This username is reserved.";
        }
        return "That username is not available. Please choose another.";
    }
    if (status == 401) return "Your session expired. Please sign in again.";
    if (status == 403) return "You do not have access to update this profile.";
    return error instanceof Error
        ? error.message
        : "Couldn't save your profile. Please try again.";
};
