import type { FriendProfile } from "data/friends";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { getKV, removeKV, setKV } from "ente-base/kv";
import log from "ente-base/log";
import { apiOrigin } from "ente-base/origins";
import type { SpaceFriendRequest } from "services/space";
import { z } from "zod";

const CachedFriendProfile = z.object({
    avatarKeyVersion: z.number().optional(),
    avatarObjectID: z.string().optional(),
    avatarSize: z.number().optional(),
    avatarUpdatedAt: z.string().optional(),
    friendsCount: z.number(),
    fullName: z.string(),
    id: z.string(),
    username: z.string(),
    spaceId: z.string().optional(),
});

const SpaceHomeItems = z.object({
    friends: CachedFriendProfile.array(),
    friendRequests: z
        .object({
            direction: z.enum(["received", "sent"]),
            friend: CachedFriendProfile,
            requestId: z.number(),
        })
        .array(),
});

const homeItemsKey = async (viewerSpaceId: string) => {
    const userID = savedPartialLocalUser()?.id;
    if (!userID) return undefined;
    return [
        "space-home-items",
        "v1",
        await apiOrigin(),
        userID,
        viewerSpaceId,
    ].join(":");
};

export const loadCachedSpaceHomeItems = async (viewerSpaceId: string) => {
    try {
        const key = await homeItemsKey(viewerSpaceId);
        if (!key) return undefined;
        const parsed = SpaceHomeItems.safeParse(await getKV(key));
        return parsed.success ? parsed.data : undefined;
    } catch (error) {
        log.warn("Failed to read Space home items cache", error);
        return undefined;
    }
};

export const cacheSpaceHomeItems = async (
    viewerSpaceId: string,
    friends: FriendProfile[],
    friendRequests: SpaceFriendRequest[],
) => {
    try {
        const key = await homeItemsKey(viewerSpaceId);
        if (key)
            await setKV(key, SpaceHomeItems.parse({ friends, friendRequests }));
    } catch (error) {
        log.warn("Failed to persist Space home items cache", error);
    }
};

export const clearCachedSpaceHomeItems = async (viewerSpaceId: string) => {
    try {
        const key = await homeItemsKey(viewerSpaceId);
        if (key) await removeKV(key);
    } catch (error) {
        log.warn("Failed to clear Space home items cache", error);
    }
};
