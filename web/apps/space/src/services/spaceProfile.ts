import {
    savedKeyAttributes,
    savedLocalUser,
} from "ente-accounts-rs/services/accounts-db";
import { masterKeyFromSession } from "ente-accounts-rs/services/session-storage";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin, apiURL } from "ente-base/origins";
import { savedAuthToken } from "ente-base/token";
import type { SpaceAccountCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type {
    SetupProfile,
    SetupProfileInput,
} from "screens/SetupProfileScreen";

const usernamePattern = /^[a-z0-9][a-z0-9._-]*$/;
const minUsernameLength = 3;
const maxUsernameLength = 30;

interface SpaceAvatar {
    objectKey: string;
    size?: number;
    updatedAt?: string;
}

interface OwnedSpace {
    spaceId: string;
    spaceSlug: string;
}

interface CreatedSpace {
    spaceId: string;
    spaceSlug: string;
}

interface SpaceLookup {
    spaceId: string;
    spaceSlug: string;
}

interface DecryptedSpaceProfile {
    spaceId: string;
    spaceSlug: string;
    profile: string;
    avatar?: SpaceAvatar;
    updatedAt?: string;
}

interface UpdateSpaceProfileResponse {
    avatar?: SpaceAvatar;
}

interface SpaceProfilePayload {
    displayName?: unknown;
    fullName?: unknown;
    username?: unknown;
}

export type UsernameAvailability = "available" | "taken";

export const normalizeSpaceUsername = (username: string) =>
    username.trim().toLowerCase();

export const spaceUsernameValidationError = (username: string) => {
    const normalized = normalizeSpaceUsername(username);
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

const spaceProfilePayloadFor = (profile: SetupProfileInput) =>
    JSON.stringify({
        displayName: profile.fullName.trim(),
        fullName: profile.fullName.trim(),
        username: normalizeSpaceUsername(profile.username),
    });

const parseSpaceProfilePayload = (profile: string): SpaceProfilePayload => {
    if (!profile.trim()) return {};
    try {
        const parsed: unknown = JSON.parse(profile);
        return parsed && typeof parsed == "object"
            ? (parsed as SpaceProfilePayload)
            : {};
    } catch {
        return {};
    }
};

const textField = (value: unknown) =>
    typeof value == "string" ? value.trim() : "";

const spaceHTTPStatus = (error: unknown) => {
    if (!error || typeof error != "object" || !("status" in error)) {
        return undefined;
    }
    const { status } = error as { status?: unknown };
    return typeof status == "number" ? status : undefined;
};

const defaultOwnedSpace = (spaces: OwnedSpace[]) => spaces[0];

const currentSpaceContextConfig = async () => {
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

    return {
        cacheKey: [
            user.id,
            authToken,
            baseUrl,
            keyAttributes.publicKey,
        ].join(":"),
        input: {
            authToken,
            baseUrl,
            clientPackage: clientPackageName,
            clientVersion: isDesktop ? desktopAppVersion : undefined,
            keyAttributes,
            masterKeyB64,
            publicKeyB64: keyAttributes.publicKey,
            userId: user.id,
        },
    };
};

let currentSpaceContext:
    | { cacheKey: string; ctx: SpaceAccountCtxHandle }
    | undefined;
let pendingCurrentSpaceContext:
    | { cacheKey: string; promise: Promise<SpaceAccountCtxHandle> }
    | undefined;
let currentSpaceContextGeneration = 0;

export const openCurrentSpaceContext = async () => {
    const config = await currentSpaceContextConfig();
    if (!config) return undefined;

    const { space_open_account_ctx } = await loadEnteWasm();
    return await space_open_account_ctx(config.input);
};

export const clearCurrentSpaceContext = () => {
    const cached = currentSpaceContext;
    currentSpaceContextGeneration += 1;
    currentSpaceContext = undefined;
    pendingCurrentSpaceContext = undefined;
    cached?.ctx.free();
};

export const ensureCurrentSpaceContext = async () => {
    const config = await currentSpaceContextConfig();
    if (!config) throw new Error("Please sign in again.");

    if (currentSpaceContext?.cacheKey == config.cacheKey) {
        return currentSpaceContext.ctx;
    }

    if (currentSpaceContext) {
        clearCurrentSpaceContext();
    }

    if (pendingCurrentSpaceContext?.cacheKey == config.cacheKey) {
        return await pendingCurrentSpaceContext.promise;
    }

    const { space_open_account_ctx } = await loadEnteWasm();
    const generation = currentSpaceContextGeneration;
    const promise = space_open_account_ctx(config.input)
        .then((ctx) => {
            if (
                currentSpaceContextGeneration != generation ||
                pendingCurrentSpaceContext?.cacheKey != config.cacheKey
            ) {
                ctx.free();
                throw new Error("Space context changed.");
            }
            currentSpaceContext = { cacheKey: config.cacheKey, ctx };
            pendingCurrentSpaceContext = undefined;
            return ctx;
        })
        .catch((error: unknown) => {
            if (pendingCurrentSpaceContext?.cacheKey == config.cacheKey) {
                pendingCurrentSpaceContext = undefined;
            }
            throw error;
        });

    pendingCurrentSpaceContext = { cacheKey: config.cacheKey, promise };
    return await promise;
};

export const releaseCurrentSpaceContext = (_ctx: SpaceAccountCtxHandle) => {
    // Shared context is freed by clearCurrentSpaceContext on logout/session change.
};

const avatarURLForRemoteAvatar = async (
    ctx: SpaceAccountCtxHandle,
    spaceId: string,
    avatar: SpaceAvatar | undefined,
) => {
    if (!avatar?.objectKey) return null;
    const bytes = await ctx.download_space_avatar(spaceId, avatar.objectKey);
    return URL.createObjectURL(new Blob([bytes]));
};

const profileFromDecryptedSpaceProfile = (
    spaceProfile: DecryptedSpaceProfile,
): SetupProfile => {
    const payload = parseSpaceProfilePayload(spaceProfile.profile);
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        spaceProfile.spaceSlug;

    return {
        avatarObjectKey: spaceProfile.avatar?.objectKey,
        avatarUpdatedAt: spaceProfile.avatar?.updatedAt,
        avatarUrl: null,
        fullName,
        username: spaceProfile.spaceSlug,
        spaceId: spaceProfile.spaceId,
        spaceSlug: spaceProfile.spaceSlug,
    };
};

export const loadExistingSpaceProfile = async () => {
    const ctx = await openCurrentSpaceContext();
    if (!ctx) return null;

    try {
        const spaces = (await ctx.list_owned_spaces()) as OwnedSpace[];
        const space = defaultOwnedSpace(spaces);
        if (!space) return null;

        const spaceProfile = (await ctx.get_space_profile(
            space.spaceId,
        )) as DecryptedSpaceProfile;
        return profileFromDecryptedSpaceProfile(spaceProfile);
    } finally {
        ctx.free();
    }
};

export const loadExistingSpaceAvatar = async (
    spaceId: string | undefined,
    avatarObjectKey: string | undefined,
) => {
    if (!spaceId || !avatarObjectKey) return null;

    const ctx = await openCurrentSpaceContext();
    if (!ctx) return null;

    try {
        return await avatarURLForRemoteAvatar(ctx, spaceId, {
            objectKey: avatarObjectKey,
        });
    } finally {
        ctx.free();
    }
};

export const spaceUsernameAvailability = async (
    username: string,
): Promise<UsernameAvailability> => {
    const validationError = spaceUsernameValidationError(username);
    if (validationError) return "taken";

    const slug = normalizeSpaceUsername(username);
    const response = await fetch(
        await apiURL(
            `/space/public/slug-availability/${encodeURIComponent(slug)}`,
        ),
    );
    if (!response.ok) {
        throw new Error("Username availability check failed.");
    }
    const { available } = (await response.json()) as { available?: unknown };
    return available === true ? "available" : "taken";
};

export const saveSpaceProfile = async (
    profile: SetupProfileInput,
): Promise<SetupProfile> => {
    const username = normalizeSpaceUsername(profile.username);
    const usernameError = spaceUsernameValidationError(username);
    if (usernameError) throw new Error(usernameError);

    const ctx = await ensureCurrentSpaceContext();
    try {
        const spaces = (await ctx.list_owned_spaces()) as OwnedSpace[];
        const existingSpace =
            (profile.spaceId &&
                spaces.find((space) => space.spaceId == profile.spaceId)) ||
            defaultOwnedSpace(spaces);
        const profilePayload = spaceProfilePayloadFor({ ...profile, username });

        let spaceId: string;
        let spaceSlug = username;
        let updateResponse: UpdateSpaceProfileResponse | undefined;

        if (existingSpace) {
            spaceId = existingSpace.spaceId;
            spaceSlug = existingSpace.spaceSlug;
            if (normalizeSpaceUsername(spaceSlug) != username) {
                const updatedSlug = (await ctx.update_space_slug(
                    spaceId,
                    username,
                )) as SpaceLookup;
                spaceSlug = updatedSlug.spaceSlug;
            }
        } else {
            const created = (await ctx.create_space(
                username,
                profilePayload,
            )) as CreatedSpace;
            spaceId = created.spaceId;
            spaceSlug = created.spaceSlug;
        }

        let avatarUrl: string | null = null;
        if (profile.avatarFile) {
            const avatarBytes = new Uint8Array(
                await profile.avatarFile.arrayBuffer(),
            );
            updateResponse = (await ctx.update_space_profile_with_avatar(
                spaceId,
                profilePayload,
                avatarBytes,
            )) as UpdateSpaceProfileResponse;
            avatarUrl = URL.createObjectURL(profile.avatarFile);
        } else if (existingSpace) {
            updateResponse = (await ctx.update_space_profile(
                spaceId,
                profilePayload,
            )) as UpdateSpaceProfileResponse;
            avatarUrl = profile.avatarUrl;
        }

        return {
            avatarObjectKey:
                updateResponse?.avatar?.objectKey ?? profile.avatarObjectKey,
            avatarUpdatedAt:
                updateResponse?.avatar?.updatedAt ?? profile.avatarUpdatedAt,
            avatarUrl,
            fullName: profile.fullName.trim(),
            username: spaceSlug,
            spaceId,
            spaceSlug,
        };
    } catch (error) {
        if (spaceHTTPStatus(error) == 409) {
            throw new Error("This username is already taken.");
        }
        throw error;
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const spaceProfileErrorMessage = (error: unknown) => {
    const status = spaceHTTPStatus(error);
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
