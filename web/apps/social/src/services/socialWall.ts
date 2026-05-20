import type { FriendProfile } from "data/friends";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import type { WallAccountCtxHandle, WallLinkCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type { PendingSocialInvite } from "services/socialInvite";
import { socialInviteURL } from "services/socialInvite";
import { ensureCurrentWallContext } from "services/socialProfile";
import { normalizeSocialWallMessageText } from "utils/socialMessageLimits";

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
    publicKey?: string;
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
    viewerUnread?: boolean;
    wallId: string;
    wallSlug: string;
}

interface WallPostPage {
    items?: WallPost[];
    nextCursor?: string;
}

type WallMessageConversationActivityType =
    | "friend_add"
    | "friend_remove"
    | "message"
    | "message_like"
    | "post_like"
    | "post_like_and_reply"
    | "post_reply";

interface WallMessageConversationPost {
    isDeleted?: boolean;
    objects?: WallPostObject[];
    postId: number;
    wallId: string;
    wallSlug: string;
}

interface WallMessageConversationActivity {
    createdAt: string;
    id: string;
    message?: WallMessage;
    post?: WallMessageConversationPost;
    type: WallMessageConversationActivityType;
}

interface WallFriend {
    createdAt: string;
    friend: WallActor;
    shareKeyVersion: number;
}

interface WallPostLikerPage {
    likers?: { actor: WallActor; createdAt: string }[];
    nextCursor?: string;
}

type WallMessageKind = "post_reply" | "regular";

interface WallMessageQuote {
    caption?: string;
    height?: number;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    wallId: string;
    width?: number;
}

interface WallMessage {
    createdAt: string;
    id?: string;
    isDeleted?: boolean;
    kind: WallMessageKind;
    messageId: string;
    likes?: number;
    quote?: WallMessageQuote;
    recipient: WallActor;
    replyMessageId?: string;
    replyPostId?: number;
    sender: WallActor;
    text: string;
    viewerLiked?: boolean;
    updatedAt: string;
}

interface WallMessagePage {
    items?: WallMessage[];
    nextCursor?: string;
}

interface WallMessageConversation {
    friend: WallActor;
    latestActivity: WallMessageConversationActivity;
    unread?: boolean;
}

interface WallMessageConversationPage {
    items?: WallMessageConversation[];
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
    viewerUnread: boolean;
    wallId: string;
    width?: number;
}

export interface SocialWallPostPage {
    items: SocialWallPost[];
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

export type SocialWallMessageKind = WallMessageKind;

export interface SocialWallMessageQuote {
    caption?: string;
    height?: number;
    imageUrl?: string;
    isUnavailable?: boolean;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    wallId: string;
    width?: number;
}

export interface SocialWallMessage {
    createdAtMs: number;
    id: string;
    isDeleted: boolean;
    kind: SocialWallMessageKind;
    likeCount: number;
    quote?: SocialWallMessageQuote;
    recipient: FriendProfile;
    replyMessageId?: string;
    replyPostId?: number;
    sender: FriendProfile;
    text: string;
    updatedAtMs: number;
    viewerLiked: boolean;
}

export type SocialWallMessageActivityType = WallMessageConversationActivityType;

export interface SocialWallMessageActivityPost {
    height?: number;
    imageUrl?: string;
    isDeleted?: boolean;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    wallId: string;
    wallSlug: string;
    width?: number;
}

export interface SocialWallMessageActivity {
    createdAtMs: number;
    id: string;
    message?: SocialWallMessage;
    post?: SocialWallMessageActivityPost;
    type: SocialWallMessageActivityType;
}

export interface SocialWallMessagePage {
    items: SocialWallMessage[];
    nextCursor?: string;
}

export interface SocialWallMessageConversation {
    friend: FriendProfile;
    latestActivity: SocialWallMessageActivity;
    unread: boolean;
}

export interface SocialWallMessageConversationPage {
    items: SocialWallMessageConversation[];
    nextCursor?: string;
}

export interface SocialWallUnreadStatus {
    feedUnread: boolean;
    notificationsUnread: boolean;
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
    try {
        return blobURLForBytes(
            await ctx.download_wall_avatar(wallId, avatar.objectKey),
        );
    } catch (error) {
        console.warn("Failed to load wall avatar", error);
        return null;
    }
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
        viewerUnread: Boolean(post.viewerUnread),
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
        viewerUnread: Boolean(post.viewerUnread),
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

const messageQuoteFromWallQuote = async (
    ctx: WallAccountCtxHandle,
    quote: WallMessageQuote | undefined,
    includeImage: boolean,
): Promise<SocialWallMessageQuote | undefined> => {
    if (!quote) return undefined;

    const socialQuote: SocialWallMessageQuote = {
        caption: quote.caption,
        height: quote.height,
        mediaType: quote.mediaType,
        objectKey: quote.objectKey,
        postId: quote.postId,
        wallId: quote.wallId,
        width: quote.width,
    };
    if (!includeImage || !quote.objectKey) return socialQuote;

    try {
        socialQuote.imageUrl = blobURLForBytes(
            await ctx.download_post_asset(
                BigInt(quote.postId),
                quote.objectKey,
            ),
            quote.mediaType,
        );
    } catch (error) {
        console.warn("Failed to load quoted post image", error);
        socialQuote.isUnavailable = true;
    }
    return socialQuote;
};

const messageFromWallMessage = async (
    ctx: WallAccountCtxHandle,
    message: WallMessage,
    includeQuoteImage: boolean,
): Promise<SocialWallMessage> => {
    const sender = actorProfile(message.sender);
    const recipient = actorProfile(message.recipient);
    const [senderAvatarUrl, recipientAvatarUrl, quote] = await Promise.all([
        accountAvatarURL(ctx, message.sender.wallId, message.sender.avatar),
        accountAvatarURL(
            ctx,
            message.recipient.wallId,
            message.recipient.avatar,
        ),
        messageQuoteFromWallQuote(ctx, message.quote, includeQuoteImage),
    ]);
    sender.avatarUrl = senderAvatarUrl;
    recipient.avatarUrl = recipientAvatarUrl;
    return {
        createdAtMs: timestampMsFromWallDate(message.createdAt),
        id: message.messageId || message.id || message.createdAt,
        isDeleted: Boolean(message.isDeleted),
        kind: message.kind,
        likeCount: message.likes ?? 0,
        quote,
        recipient,
        replyMessageId: message.replyMessageId,
        replyPostId: message.replyPostId,
        sender,
        text: message.text,
        updatedAtMs: timestampMsFromWallDate(message.updatedAt),
        viewerLiked: Boolean(message.viewerLiked),
    };
};

const messageActivityPostFromWallPost = async (
    ctx: WallAccountCtxHandle,
    post: WallMessageConversationPost | undefined,
): Promise<SocialWallMessageActivityPost | undefined> => {
    if (!post) return undefined;

    const object = firstObject(post);
    const socialPost: SocialWallMessageActivityPost = {
        height: object?.height,
        mediaType: object?.mediaType,
        isDeleted: Boolean(post.isDeleted),
        objectKey: object?.objectKey,
        postId: post.postId,
        wallId: post.wallId,
        wallSlug: post.wallSlug,
        width: object?.width,
    };
    if (post.isDeleted || !object?.objectKey) return socialPost;

    try {
        socialPost.imageUrl = blobURLForBytes(
            await ctx.download_post_asset(
                BigInt(post.postId),
                object.objectKey,
            ),
            object.mediaType,
        );
    } catch (error) {
        console.warn("Failed to load message activity post image", error);
    }
    return socialPost;
};

const messageActivityFromWallActivity = async (
    ctx: WallAccountCtxHandle,
    activity: WallMessageConversationActivity,
): Promise<SocialWallMessageActivity> => {
    const [message, post] = await Promise.all([
        activity.message
            ? messageFromWallMessage(ctx, activity.message, false)
            : undefined,
        messageActivityPostFromWallPost(ctx, activity.post),
    ]);
    return {
        createdAtMs: timestampMsFromWallDate(activity.createdAt),
        id: activity.id,
        message,
        post,
        type: activity.type,
    };
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

export const loadCurrentUnreadStatus =
    async (): Promise<SocialWallUnreadStatus> => {
        const ctx = await ensureCurrentWallContext();
        try {
            return (await ctx.unread_status()) as SocialWallUnreadStatus;
        } finally {
            ctx.free();
        }
    };

export const markCurrentFeedRead = async (postId: number) => {
    if (postId <= 0) return;
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.mark_feed_read(BigInt(postId));
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
    height,
    wallId,
    width,
}: {
    caption?: string;
    file: File;
    height?: number;
    wallId: string;
    width?: number;
}) => {
    const ctx = await ensureCurrentWallContext();
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const normalizedWidth = normalizedImageDimension(width);
        const normalizedHeight = normalizedImageDimension(height);
        const created = (await ctx.create_photo_post(
            wallId,
            bytes,
            caption?.trim() || null,
            normalizedWidth,
            normalizedHeight,
            file.type || null,
        )) as WallPost;
        return await postFromAccountPost(ctx, created);
    } finally {
        ctx.free();
    }
};

const normalizedImageDimension = (dimension: number | undefined) =>
    typeof dimension == "number" && Number.isFinite(dimension) && dimension > 0
        ? Math.round(dimension)
        : null;

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

export const replyToCurrentPost = async (postId: number, text: string) => {
    const messageText = normalizeSocialWallMessageText(text);
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.reply_to_post(BigInt(postId), messageText);
    } finally {
        ctx.free();
    }
};

export const sendCurrentMessage = async (wallId: string, text: string) => {
    const messageText = normalizeSocialWallMessageText(text);
    const ctx = await ensureCurrentWallContext();
    try {
        return await messageFromWallMessage(
            ctx,
            (await ctx.send_message(wallId, messageText)) as WallMessage,
            true,
        );
    } finally {
        ctx.free();
    }
};

export const replyToCurrentMessage = async (
    wallId: string,
    messageId: string,
    text: string,
) => {
    const messageText = normalizeSocialWallMessageText(text);
    const ctx = await ensureCurrentWallContext();
    try {
        return await messageFromWallMessage(
            ctx,
            (await ctx.reply_to_message(
                wallId,
                messageId,
                messageText,
            )) as WallMessage,
            true,
        );
    } finally {
        ctx.free();
    }
};

export const setCurrentMessageLiked = async (
    messageId: string,
    liked: boolean,
) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.like_message(messageId, liked);
    } finally {
        ctx.free();
    }
};

export const deleteCurrentMessage = async (messageId: string) => {
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.delete_message(messageId);
    } finally {
        ctx.free();
    }
};

export const loadCurrentMessageConversations =
    async (): Promise<SocialWallMessageConversationPage> => {
        const ctx = await ensureCurrentWallContext();
        try {
            const page = (await ctx.list_message_conversations(
                null,
                50,
            )) as WallMessageConversationPage;
            const items = await Promise.all(
                (page.items ?? []).map(async (conversation) => {
                    const friend = actorProfile(conversation.friend);
                    friend.avatarUrl = await accountAvatarURL(
                        ctx,
                        conversation.friend.wallId,
                        conversation.friend.avatar,
                    );
                    return {
                        friend,
                        latestActivity: await messageActivityFromWallActivity(
                            ctx,
                            conversation.latestActivity,
                        ),
                        unread: Boolean(conversation.unread),
                    };
                }),
            );
            return { items, nextCursor: page.nextCursor || undefined };
        } finally {
            ctx.free();
        }
    };

export const loadCurrentMessageThread = async (
    wallId: string,
): Promise<SocialWallMessagePage> => {
    const ctx = await ensureCurrentWallContext();
    try {
        const page = (await ctx.list_message_thread(
            wallId,
            null,
            100,
        )) as WallMessagePage;
        const items = (
            await Promise.all(
                (page.items ?? []).map((message) =>
                    messageFromWallMessage(ctx, message, true),
                ),
            )
        ).reverse();
        return { items, nextCursor: page.nextCursor || undefined };
    } finally {
        ctx.free();
    }
};

export const markCurrentNotificationsRead = async (friendWallId: string) => {
    if (!friendWallId.trim()) return;
    const ctx = await ensureCurrentWallContext();
    try {
        await ctx.mark_notifications_read(friendWallId);
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
