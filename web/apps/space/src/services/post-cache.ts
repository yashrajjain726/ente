import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { getKV, removeKV, setKV } from "ente-base/kv";
import log from "ente-base/log";
import { apiOrigin } from "ente-base/origins";
import type { SpacePost } from "services/space";
import { z } from "zod";

const CachedSpacePostAsset = z.object({
    encryptedPostKey: z.string(),
    keyVersion: z.number(),
    mediaType: z.string().optional(),
    objectKey: z.string(),
    postId: z.number(),
    spaceId: z.string(),
});

export const CachedSpacePost = z.object({
    avatarKeyVersion: z.number().optional(),
    avatarObjectID: z.string().optional(),
    avatarSize: z.number().optional(),
    avatarUpdatedAt: z.string().optional(),
    caption: z.string().optional(),
    friendID: z.string(),
    height: z.number().optional(),
    imageAsset: CachedSpacePostAsset.optional(),
    isUnavailable: z.boolean().optional(),
    name: z.string(),
    postId: z.number(),
    spaceId: z.string(),
    thumbHash: z.string().optional(),
    timestampMs: z.number(),
    username: z.string().optional(),
    viewerLiked: z.boolean(),
    width: z.number().optional(),
});

const ownLatestPostKey = async (spaceId: string) => {
    const userID = savedPartialLocalUser()?.id;
    if (!userID) return undefined;
    return [
        "space-own-latest-post",
        "v1",
        await apiOrigin(),
        userID,
        spaceId,
    ].join(":");
};

export const loadCachedOwnLatestPost = async (spaceId: string) => {
    try {
        const key = await ownLatestPostKey(spaceId);
        if (!key) return undefined;
        const parsed = CachedSpacePost.safeParse(await getKV(key));
        return parsed.success ? parsed.data : undefined;
    } catch (error) {
        log.warn("Failed to read own latest Space post cache", error);
        return undefined;
    }
};

export const cacheOwnLatestPost = async (
    spaceId: string,
    post: SpacePost | undefined,
) => {
    try {
        const key = await ownLatestPostKey(spaceId);
        if (!key) return;
        if (post) await setKV(key, CachedSpacePost.parse(post));
        else await removeKV(key);
    } catch (error) {
        log.warn("Failed to persist own latest Space post cache", error);
    }
};

export const patchCachedOwnLatestPost = async (
    spaceId: string,
    postId: number,
    patch: Partial<SpacePost> | undefined,
) => {
    const post = await loadCachedOwnLatestPost(spaceId);
    if (post?.postId == postId) {
        await cacheOwnLatestPost(
            spaceId,
            patch ? { ...post, ...patch } : undefined,
        );
    }
};
