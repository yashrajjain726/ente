import type { FriendProfile } from "data/friends";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import type { WallAccountCtxHandle, WallLinkCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type { PendingSocialInvite } from "services/socialInvite";
import { socialInviteURL } from "services/socialInvite";
import { ensureCurrentWallContext } from "services/socialProfile";

interface WallAvatar {
    objectKey: string;
    size?: number;
    updatedAt?: string;
}

interface WallProfilePayload {
    displayName?: unknown;
    fullName?: unknown;
    username?: unknown;
}

interface WallProfileResponse {
    avatar?: WallAvatar;
    friends?: number;
    profile: string;
    updatedAt?: string;
    version?: number;
    wallId: string;
    wallSlug: string;
}

interface WallActor {
    avatar?: WallAvatar;
    friends?: number;
    posts?: number;
    profile?: string;
    userId?: number;
    wallId: string;
    wallSlug: string;
}

interface WallPostObject {
    height?: number;
    mediaType?: string;
    objectKey: string;
    width?: number;
}

interface WallPost {
    author: WallActor;
    caption?: string;
    createdAt: string;
    likes: number;
    objects?: WallPostObject[];
    postId: number;
    viewerLiked: boolean;
    wallId: string;
    wallSlug: string;
}

interface WallPostPage {
    items?: WallPost[];
    nextCursor?: string;
}

interface WallFriend {
    createdAt: string;
    friend: WallActor;
    shareKeyVersion: number;
}

interface WallNotification {
    actor: WallActor;
    createdAt: string;
    id: string;
    post?: {
        author: WallActor;
        objects?: WallPostObject[];
        postId: number;
        wallId: string;
        wallSlug: string;
    };
    type: "likedPost" | "addedYouAsFriend" | "removedYouAsFriend";
}

interface WallNotificationPage {
    items?: WallNotification[];
    nextCursor?: string;
}

interface WallPostLikerPage {
    likers?: { actor: WallActor; createdAt: string }[];
    nextCursor?: string;
}

export interface SocialWallPost {
    avatarUrl?: string | null;
    caption?: string;
    friendID: string;
    height?: number;
    imageUrl: string;
    likeCount: number;
    name: string;
    postId: number;
    timestampMs: number;
    viewerLiked: boolean;
    wallId: string;
    width?: number;
}

export interface SocialWallPostPage {
    items: SocialWallPost[];
    nextCursor?: string;
}

export interface SocialWallNotification {
    actor: FriendProfile;
    id: string;
    post?: SocialWallPost;
    timestampMs: number;
    type: "added-friend" | "liked-post" | "removed-friend";
}

export interface SocialWallNotificationPage {
    items: SocialWallNotification[];
    nextCursor?: string;
}

export interface SocialWallLink {
    accessKey: string;
    url: string;
    wallId: string;
    wallSlug: string;
    wallUsername: string;
}

export interface SocialLiker {
    avatarUrl?: string | null;
    friendID?: string;
    id: string;
    name: string;
}

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

const timestampMsFromWallDate = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
};

const blobURLForBytes = (bytes: Uint8Array, mediaType?: string) =>
    URL.createObjectURL(new Blob([bytes], { type: mediaType || undefined }));

const actorProfile = (actor: WallActor): FriendProfile => {
    const payload = parseWallProfilePayload(actor.profile ?? "");
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        actor.wallSlug;
    const username = actor.wallSlug;

    return {
        avatarUrl: null,
        friendsCount: actor.friends ?? 0,
        fullName,
        id: actor.wallId || username,
        username,
        wallId: actor.wallId,
        wallSlug: actor.wallSlug,
    };
};

const profileFromWallProfile = (
    wallProfile: WallProfileResponse,
): FriendProfile => {
    const payload = parseWallProfilePayload(wallProfile.profile);
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        wallProfile.wallSlug;

    return {
        avatarUrl: null,
        friendsCount: wallProfile.friends ?? 0,
        fullName,
        id: wallProfile.wallId || wallProfile.wallSlug,
        username: wallProfile.wallSlug,
        wallId: wallProfile.wallId,
        wallSlug: wallProfile.wallSlug,
    };
};

const accountAvatarURL = async (
    ctx: WallAccountCtxHandle,
    wallId: string | undefined,
    avatar: WallAvatar | undefined,
) => {
    if (!wallId || !avatar?.objectKey) return null;
    return blobURLForBytes(
        await ctx.download_wall_avatar(wallId, avatar.objectKey),
    );
};

const linkAvatarURL = async (
    ctx: WallLinkCtxHandle,
    avatar: WallAvatar | undefined,
) => {
    if (!avatar?.objectKey) return null;
    return blobURLForBytes(await ctx.download_wall_avatar(avatar.objectKey));
};

const firstObject = (post: Pick<WallPost, "objects">) =>
    post.objects?.find((object) => object.objectKey.trim()) ?? null;

const postFromAccountPost = async (
    ctx: WallAccountCtxHandle,
    post: WallPost,
): Promise<SocialWallPost | null> => {
    const object = firstObject(post);
    if (!object) return null;

    const author = actorProfile(post.author);
    author.avatarUrl = await accountAvatarURL(
        ctx,
        post.author.wallId,
        post.author.avatar,
    );

    const imageUrl = blobURLForBytes(
        await ctx.download_post_asset(BigInt(post.postId), object.objectKey),
        object.mediaType,
    );
    return {
        avatarUrl: author.avatarUrl,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageUrl,
        likeCount: post.likes,
        name: author.fullName || author.username,
        postId: post.postId,
        timestampMs: timestampMsFromWallDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        wallId: post.wallId,
        width: object.width,
    };
};

const postFromLinkPost = async (
    ctx: WallLinkCtxHandle,
    post: WallPost,
): Promise<SocialWallPost | null> => {
    const object = firstObject(post);
    if (!object) return null;

    const author = actorProfile(post.author);
    author.avatarUrl = await linkAvatarURL(ctx, post.author.avatar);

    const imageUrl = blobURLForBytes(
        await ctx.download_post_asset(BigInt(post.postId), object.objectKey),
        object.mediaType,
    );
    return {
        avatarUrl: author.avatarUrl,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageUrl,
        likeCount: post.likes,
        name: author.fullName || author.username,
        postId: post.postId,
        timestampMs: timestampMsFromWallDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        wallId: post.wallId,
        width: object.width,
    };
};

const postPageFromAccountPage = async (
    ctx: WallAccountCtxHandle,
    page: WallPostPage,
): Promise<SocialWallPostPage> => {
    const items = (
        await Promise.all(
            (page.items ?? []).map((post) => postFromAccountPost(ctx, post)),
        )
    ).filter((post): post is SocialWallPost => Boolean(post));
    return { items, nextCursor: page.nextCursor || undefined };
};

const postPageFromLinkPage = async (
    ctx: WallLinkCtxHandle,
    page: WallPostPage,
): Promise<SocialWallPostPage> => {
    const items = (
        await Promise.all(
            (page.items ?? []).map((post) => postFromLinkPost(ctx, post)),
        )
    ).filter((post): post is SocialWallPost => Boolean(post));
    return { items, nextCursor: page.nextCursor || undefined };
};

export const createCurrentProfileLink = async (
    wallId: string,
): Promise<SocialWallLink> => {
    const ctx = await ensureCurrentWallContext();
    try {
        const created = (await ctx.create_wall_link(wallId)) as {
            accessKey: string;
            keyVersion: number;
            wallId: string;
            wallSlug: string;
            wallUsername: string;
        };
        const invite: PendingSocialInvite = {
            accessKey: created.accessKey,
            wallUsername: created.wallUsername || created.wallSlug,
        };
        return {
            accessKey: created.accessKey,
            url: socialInviteURL(invite),
            wallId: created.wallId,
            wallSlug: created.wallSlug,
            wallUsername: invite.wallUsername,
        };
    } finally {
        ctx.free();
    }
};

export const joinSocialInvite = async ({
    accessKey,
    wallUsername,
}: PendingSocialInvite) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.join_wall_link(wallUsername, accessKey);
    } finally {
        ctx.free();
    }
};

export const loadCurrentWallFriends = async (wallId: string) => {
    const ctx = await ensureCurrentWallContext();
    try {
        const friends = (await ctx.list_wall_friends(wallId)) as WallFriend[];
        return await Promise.all(
            friends.map(async ({ friend }) => {
                const profile = actorProfile(friend);
                profile.avatarUrl = await accountAvatarURL(
                    ctx,
                    friend.wallId,
                    friend.avatar,
                );
                return profile;
            }),
        );
    } finally {
        ctx.free();
    }
};

export const removeCurrentWallFriend = async (wallId: string) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.remove_friend_by_wall(wallId);
    } finally {
        ctx.free();
    }
};

export const loadCurrentFeedPage = async (
    cursor?: string,
): Promise<SocialWallPostPage> => {
    const ctx = await ensureCurrentWallContext();
    try {
        return await postPageFromAccountPage(
            ctx,
            (await ctx.list_feed(cursor ?? null, 30)) as WallPostPage,
        );
    } finally {
        ctx.free();
    }
};

export const loadCurrentWallPostsPage = async (
    wallId: string,
    cursor?: string,
): Promise<SocialWallPostPage> => {
    const ctx = await ensureCurrentWallContext();
    try {
        return await postPageFromAccountPage(
            ctx,
            (await ctx.list_posts(wallId, cursor ?? null, 60)) as WallPostPage,
        );
    } finally {
        ctx.free();
    }
};

export const createCurrentPhotoPost = async ({
    caption,
    file,
    wallId,
}: {
    caption?: string;
    file: File;
    wallId: string;
}) => {
    const ctx = await ensureCurrentWallContext();
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const created = (await ctx.create_photo_post(
            wallId,
            bytes,
            caption?.trim() || null,
            null,
            null,
            file.type || null,
        )) as WallPost;
        return await postFromAccountPost(ctx, created);
    } finally {
        ctx.free();
    }
};

export const setCurrentPostLiked = async (postId: number, liked: boolean) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.like_post(BigInt(postId), liked);
    } finally {
        ctx.free();
    }
};

export const loadCurrentPostLikers = async (postId: number) => {
    const ctx = await ensureCurrentWallContext();
    try {
        const page = (await ctx.list_post_likers(
            BigInt(postId),
            null,
            100,
        )) as WallPostLikerPage;
        return await Promise.all(
            (page.likers ?? []).map(async ({ actor }) => {
                const profile = actorProfile(actor);
                profile.avatarUrl = await accountAvatarURL(
                    ctx,
                    actor.wallId,
                    actor.avatar,
                );
                return {
                    avatarUrl: profile.avatarUrl,
                    friendID: profile.id,
                    id: profile.id,
                    name: profile.fullName || profile.username,
                };
            }),
        );
    } finally {
        ctx.free();
    }
};

export const deleteCurrentPost = async (postId: number) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.delete_post(BigInt(postId));
    } finally {
        ctx.free();
    }
};

export const loadCurrentNotificationsPage =
    async (): Promise<SocialWallNotificationPage> => {
        const ctx = await ensureCurrentWallContext();
        try {
            const page = (await ctx.list_notifications(
                null,
                50,
            )) as WallNotificationPage;
            const items = await Promise.all(
                (page.items ?? []).map(async (notification) => {
                    const actor = actorProfile(notification.actor);
                    actor.avatarUrl = await accountAvatarURL(
                        ctx,
                        notification.actor.wallId,
                        notification.actor.avatar,
                    );
                    const postObject = notification.post
                        ? firstObject(notification.post)
                        : null;
                    const post =
                        notification.post && postObject
                            ? await postFromAccountPost(ctx, {
                                  author: notification.post.author,
                                  createdAt: notification.createdAt,
                                  likes: 0,
                                  objects: notification.post.objects,
                                  postId: notification.post.postId,
                                  viewerLiked: false,
                                  wallId: notification.post.wallId,
                                  wallSlug: notification.post.wallSlug,
                              })
                            : undefined;
                    const notificationType: SocialWallNotification["type"] =
                        notification.type == "addedYouAsFriend"
                            ? "added-friend"
                            : notification.type == "removedYouAsFriend"
                              ? "removed-friend"
                              : "liked-post";
                    return {
                        actor,
                        id: notification.id,
                        post: post ?? undefined,
                        timestampMs: timestampMsFromWallDate(
                            notification.createdAt,
                        ),
                        type: notificationType,
                    };
                }),
            );
            return { items, nextCursor: page.nextCursor || undefined };
        } finally {
            ctx.free();
        }
    };

export const loadPublicSocialInvite = async ({
    accessKey,
    wallUsername,
}: PendingSocialInvite) => {
    const { wall_open_link_ctx } = await loadEnteWasm();
    const ctx = await wall_open_link_ctx({
        accessKey,
        baseUrl: await apiOrigin(),
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
        wallUsername,
    });
    try {
        const wallProfile =
            (await ctx.get_wall_profile()) as WallProfileResponse;
        const profile = profileFromWallProfile(wallProfile);
        profile.avatarUrl = await linkAvatarURL(ctx, wallProfile.avatar);
        const posts = await postPageFromLinkPage(
            ctx,
            (await ctx.list_posts(null, 60)) as WallPostPage,
        );
        return { posts: posts.items, profile };
    } finally {
        ctx.free();
    }
};
