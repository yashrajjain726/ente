import type { FriendProfile } from "data/friends";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import type { SpaceAccountCtxHandle, SpaceLinkCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type { PendingSpaceInvite } from "services/spaceInvite";
import { spaceInviteURL } from "services/spaceInvite";
import { ensureCurrentSpaceContext } from "services/spaceProfile";
import { normalizeSpaceMessageText } from "utils/spaceMessageLimits";

interface SpaceAvatar {
    objectKey: string;
    size?: number;
    updatedAt?: string;
}

interface SpaceProfilePayload {
    displayName?: unknown;
    fullName?: unknown;
    username?: unknown;
}

interface SpaceProfileResponse {
    avatar?: SpaceAvatar;
    friends?: number;
    profile: string;
    updatedAt?: string;
    version?: number;
    spaceId: string;
    spaceSlug: string;
}

interface SpaceActor {
    avatar?: SpaceAvatar;
    friends?: number;
    posts?: number;
    profile?: string;
    publicKey?: string;
    userId?: number;
    spaceId: string;
    spaceSlug: string;
}

interface SpacePostObject {
    height?: number;
    mediaType?: string;
    objectKey: string;
    width?: number;
}

interface SpacePostResponse {
    author: SpaceActor;
    caption?: string;
    createdAt: string;
    likes: number;
    objects?: SpacePostObject[];
    postId: number;
    viewerLiked: boolean;
    viewerUnread?: boolean;
    spaceId: string;
    spaceSlug: string;
}

interface SpacePostPageResponse {
    items?: SpacePostResponse[];
    nextCursor?: string;
}

type SpaceMessageConversationActivityType =
    | "friend_add"
    | "friend_remove"
    | "message"
    | "message_like"
    | "post_like"
    | "post_like_and_reply"
    | "post_reply";

interface SpaceMessageConversationPostResponse {
    isDeleted?: boolean;
    objects?: SpacePostObject[];
    postId: number;
    spaceId: string;
    spaceSlug: string;
}

interface SpaceMessageConversationActivity {
    createdAt: string;
    id: string;
    message?: SpaceMessageResponse;
    post?: SpaceMessageConversationPostResponse;
    type: SpaceMessageConversationActivityType;
}

interface SpaceFriend {
    createdAt: string;
    friend: SpaceActor;
    shareKeyVersion: number;
}

interface SpacePostLikerPage {
    likers?: { actor: SpaceActor; createdAt: string }[];
    nextCursor?: string;
}

type SpaceMessageKindResponse = "post_reply" | "regular";

interface SpaceMessageQuoteResponse {
    caption?: string;
    height?: number;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    spaceId: string;
    width?: number;
}

interface SpaceMessageResponse {
    createdAt: string;
    id?: string;
    isDeleted?: boolean;
    kind: SpaceMessageKindResponse;
    messageId: string;
    likes?: number;
    quote?: SpaceMessageQuoteResponse;
    recipient: SpaceActor;
    replyMessageId?: string;
    replyPostId?: number;
    sender: SpaceActor;
    text: string;
    viewerLiked?: boolean;
    updatedAt: string;
}

interface SpaceMessagePageResponse {
    items?: SpaceMessageResponse[];
    nextCursor?: string;
}

interface SpaceMessageConversationResponse {
    friend: SpaceActor;
    latestActivity: SpaceMessageConversationActivity;
    unread?: boolean;
}

interface SpaceMessageConversationPageResponse {
    items?: SpaceMessageConversationResponse[];
    nextCursor?: string;
}

export interface SpacePost {
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
    spaceId: string;
    width?: number;
}

export interface SpacePostPage {
    items: SpacePost[];
    nextCursor?: string;
}

export interface SpaceLink {
    accessKey: string;
    url: string;
    spaceId: string;
    spaceSlug: string;
    spaceUsername: string;
}

export interface SpaceLiker {
    avatarUrl?: string | null;
    friendID?: string;
    id: string;
    name: string;
}

export type SpaceMessageKind = SpaceMessageKindResponse;

export interface SpaceMessageQuote {
    caption?: string;
    height?: number;
    imageUrl?: string;
    isUnavailable?: boolean;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    spaceId: string;
    width?: number;
}

export interface SpaceMessage {
    createdAtMs: number;
    id: string;
    isDeleted: boolean;
    kind: SpaceMessageKind;
    likeCount: number;
    quote?: SpaceMessageQuote;
    recipient: FriendProfile;
    replyMessageId?: string;
    replyPostId?: number;
    sender: FriendProfile;
    text: string;
    updatedAtMs: number;
    viewerLiked: boolean;
}

export type SpaceMessageActivityType = SpaceMessageConversationActivityType;

export interface SpaceMessageActivityPost {
    height?: number;
    imageUrl?: string;
    isDeleted?: boolean;
    mediaType?: string;
    objectKey?: string;
    postId: number;
    spaceId: string;
    spaceSlug: string;
    width?: number;
}

export interface SpaceMessageActivity {
    createdAtMs: number;
    id: string;
    message?: SpaceMessage;
    post?: SpaceMessageActivityPost;
    type: SpaceMessageActivityType;
}

export interface SpaceMessagePage {
    items: SpaceMessage[];
    nextCursor?: string;
}

export interface SpaceMessageConversation {
    friend: FriendProfile;
    latestActivity: SpaceMessageActivity;
    unread: boolean;
}

export interface SpaceMessageConversationPage {
    items: SpaceMessageConversation[];
    nextCursor?: string;
}

export interface SpaceUnreadStatus {
    feedUnread: boolean;
    notificationsUnread: boolean;
}

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

const timestampMsFromSpaceDate = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
};

const blobURLForBytes = (bytes: Uint8Array, mediaType?: string) =>
    URL.createObjectURL(new Blob([bytes], { type: mediaType || undefined }));

const actorProfile = (actor: SpaceActor): FriendProfile => {
    const payload = parseSpaceProfilePayload(actor.profile ?? "");
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        actor.spaceSlug;
    const username = actor.spaceSlug;

    return {
        avatarUrl: null,
        friendsCount: actor.friends ?? 0,
        fullName,
        id: actor.spaceId || username,
        username,
        spaceId: actor.spaceId,
        spaceSlug: actor.spaceSlug,
    };
};

const profileFromSpaceProfile = (
    spaceProfile: SpaceProfileResponse,
): FriendProfile => {
    const payload = parseSpaceProfilePayload(spaceProfile.profile);
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        spaceProfile.spaceSlug;

    return {
        avatarUrl: null,
        friendsCount: spaceProfile.friends ?? 0,
        fullName,
        id: spaceProfile.spaceId || spaceProfile.spaceSlug,
        username: spaceProfile.spaceSlug,
        spaceId: spaceProfile.spaceId,
        spaceSlug: spaceProfile.spaceSlug,
    };
};

const accountAvatarURL = async (
    ctx: SpaceAccountCtxHandle,
    spaceId: string | undefined,
    avatar: SpaceAvatar | undefined,
) => {
    if (!spaceId || !avatar?.objectKey) return null;
    try {
        return blobURLForBytes(
            await ctx.download_space_avatar(spaceId, avatar.objectKey),
        );
    } catch (error) {
        console.warn("Failed to load space avatar", error);
        return null;
    }
};

const linkAvatarURL = async (
    ctx: SpaceLinkCtxHandle,
    avatar: SpaceAvatar | undefined,
) => {
    if (!avatar?.objectKey) return null;
    return blobURLForBytes(await ctx.download_space_avatar(avatar.objectKey));
};

const firstObject = (post: { objects?: SpacePostObject[] }) =>
    post.objects?.find((object) => object.objectKey.trim()) ?? null;

const postFromAccountPost = async (
    ctx: SpaceAccountCtxHandle,
    post: SpacePostResponse,
): Promise<SpacePost | null> => {
    const object = firstObject(post);
    if (!object) return null;

    const author = actorProfile(post.author);
    author.avatarUrl = await accountAvatarURL(
        ctx,
        post.author.spaceId,
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
        timestampMs: timestampMsFromSpaceDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        viewerUnread: Boolean(post.viewerUnread),
        spaceId: post.spaceId,
        width: object.width,
    };
};

const postFromLinkPost = async (
    ctx: SpaceLinkCtxHandle,
    post: SpacePostResponse,
): Promise<SpacePost | null> => {
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
        timestampMs: timestampMsFromSpaceDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        viewerUnread: Boolean(post.viewerUnread),
        spaceId: post.spaceId,
        width: object.width,
    };
};

const postPageFromAccountPage = async (
    ctx: SpaceAccountCtxHandle,
    page: SpacePostPageResponse,
): Promise<SpacePostPage> => {
    const items = (
        await Promise.all(
            (page.items ?? []).map((post) => postFromAccountPost(ctx, post)),
        )
    ).filter((post): post is SpacePost => Boolean(post));
    return { items, nextCursor: page.nextCursor || undefined };
};

const postPageFromLinkPage = async (
    ctx: SpaceLinkCtxHandle,
    page: SpacePostPageResponse,
): Promise<SpacePostPage> => {
    const items = (
        await Promise.all(
            (page.items ?? []).map((post) => postFromLinkPost(ctx, post)),
        )
    ).filter((post): post is SpacePost => Boolean(post));
    return { items, nextCursor: page.nextCursor || undefined };
};

const messageQuoteFromSpaceQuote = async (
    ctx: SpaceAccountCtxHandle,
    quote: SpaceMessageQuoteResponse | undefined,
    includeImage: boolean,
): Promise<SpaceMessageQuote | undefined> => {
    if (!quote) return undefined;

    const spaceQuote: SpaceMessageQuote = {
        caption: quote.caption,
        height: quote.height,
        mediaType: quote.mediaType,
        objectKey: quote.objectKey,
        postId: quote.postId,
        spaceId: quote.spaceId,
        width: quote.width,
    };
    if (!includeImage || !quote.objectKey) return spaceQuote;

    try {
        spaceQuote.imageUrl = blobURLForBytes(
            await ctx.download_post_asset(
                BigInt(quote.postId),
                quote.objectKey,
            ),
            quote.mediaType,
        );
    } catch (error) {
        console.warn("Failed to load quoted post image", error);
        spaceQuote.isUnavailable = true;
    }
    return spaceQuote;
};

const messageFromSpaceMessage = async (
    ctx: SpaceAccountCtxHandle,
    message: SpaceMessageResponse,
    includeQuoteImage: boolean,
): Promise<SpaceMessage> => {
    const sender = actorProfile(message.sender);
    const recipient = actorProfile(message.recipient);
    const [senderAvatarUrl, recipientAvatarUrl, quote] = await Promise.all([
        accountAvatarURL(ctx, message.sender.spaceId, message.sender.avatar),
        accountAvatarURL(
            ctx,
            message.recipient.spaceId,
            message.recipient.avatar,
        ),
        messageQuoteFromSpaceQuote(ctx, message.quote, includeQuoteImage),
    ]);
    sender.avatarUrl = senderAvatarUrl;
    recipient.avatarUrl = recipientAvatarUrl;
    return {
        createdAtMs: timestampMsFromSpaceDate(message.createdAt),
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
        updatedAtMs: timestampMsFromSpaceDate(message.updatedAt),
        viewerLiked: Boolean(message.viewerLiked),
    };
};

const messageActivityPostFromSpacePost = async (
    ctx: SpaceAccountCtxHandle,
    post: SpaceMessageConversationPostResponse | undefined,
): Promise<SpaceMessageActivityPost | undefined> => {
    if (!post) return undefined;

    const object = firstObject(post);
    const spacePost: SpaceMessageActivityPost = {
        height: object?.height,
        mediaType: object?.mediaType,
        isDeleted: Boolean(post.isDeleted),
        objectKey: object?.objectKey,
        postId: post.postId,
        spaceId: post.spaceId,
        spaceSlug: post.spaceSlug,
        width: object?.width,
    };
    if (post.isDeleted || !object?.objectKey) return spacePost;

    try {
        spacePost.imageUrl = blobURLForBytes(
            await ctx.download_post_asset(
                BigInt(post.postId),
                object.objectKey,
            ),
            object.mediaType,
        );
    } catch (error) {
        console.warn("Failed to load message activity post image", error);
    }
    return spacePost;
};

const messageActivityFromSpaceActivity = async (
    ctx: SpaceAccountCtxHandle,
    activity: SpaceMessageConversationActivity,
): Promise<SpaceMessageActivity> => {
    const [message, post] = await Promise.all([
        activity.message
            ? messageFromSpaceMessage(ctx, activity.message, false)
            : undefined,
        messageActivityPostFromSpacePost(ctx, activity.post),
    ]);
    return {
        createdAtMs: timestampMsFromSpaceDate(activity.createdAt),
        id: activity.id,
        message,
        post,
        type: activity.type,
    };
};

export const createCurrentProfileLink = async (
    spaceId: string,
): Promise<SpaceLink> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const created = (await ctx.create_space_link(spaceId)) as {
            accessKey: string;
            keyVersion: number;
            spaceId: string;
            spaceSlug: string;
            spaceUsername: string;
        };
        const invite: PendingSpaceInvite = {
            accessKey: created.accessKey,
            spaceUsername: created.spaceUsername || created.spaceSlug,
        };
        return {
            accessKey: created.accessKey,
            url: spaceInviteURL(invite),
            spaceId: created.spaceId,
            spaceSlug: created.spaceSlug,
            spaceUsername: invite.spaceUsername,
        };
    } finally {
        ctx.free();
    }
};

export const joinSpaceInvite = async ({
    accessKey,
    spaceUsername,
}: PendingSpaceInvite) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.join_space_link(spaceUsername, accessKey);
    } finally {
        ctx.free();
    }
};

export const loadCurrentSpaceFriends = async (spaceId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const friends = (await ctx.list_space_friends(
            spaceId,
        )) as SpaceFriend[];
        return await Promise.all(
            friends.map(async ({ friend }) => {
                const profile = actorProfile(friend);
                profile.avatarUrl = await accountAvatarURL(
                    ctx,
                    friend.spaceId,
                    friend.avatar,
                );
                return profile;
            }),
        );
    } finally {
        ctx.free();
    }
};

export const removeCurrentSpaceFriend = async (spaceId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.remove_friend_by_space(spaceId);
    } finally {
        ctx.free();
    }
};

export const loadCurrentFeedPage = async (
    cursor?: string,
): Promise<SpacePostPage> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await postPageFromAccountPage(
            ctx,
            (await ctx.list_feed(cursor ?? null, 30)) as SpacePostPageResponse,
        );
    } finally {
        ctx.free();
    }
};

export const loadCurrentUnreadStatus = async (): Promise<SpaceUnreadStatus> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return (await ctx.unread_status()) as SpaceUnreadStatus;
    } finally {
        ctx.free();
    }
};

export const markCurrentFeedRead = async (postId: number) => {
    if (postId <= 0) return;
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.mark_feed_read(BigInt(postId));
    } finally {
        ctx.free();
    }
};

export const loadCurrentSpacePostsPage = async (
    spaceId: string,
    cursor?: string,
): Promise<SpacePostPage> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await postPageFromAccountPage(
            ctx,
            (await ctx.list_posts(
                spaceId,
                cursor ?? null,
                60,
            )) as SpacePostPageResponse,
        );
    } finally {
        ctx.free();
    }
};

export const createCurrentPhotoPost = async ({
    caption,
    file,
    height,
    spaceId,
    width,
}: {
    caption?: string;
    file: File;
    height?: number;
    spaceId: string;
    width?: number;
}) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const normalizedWidth = normalizedImageDimension(width);
        const normalizedHeight = normalizedImageDimension(height);
        const created = (await ctx.create_photo_post(
            spaceId,
            bytes,
            caption?.trim() || null,
            normalizedWidth,
            normalizedHeight,
            file.type || null,
        )) as SpacePostResponse;
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
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.like_post(BigInt(postId), liked);
    } finally {
        ctx.free();
    }
};

export const loadCurrentPostLikers = async (postId: number) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const page = (await ctx.list_post_likers(
            BigInt(postId),
            null,
            100,
        )) as SpacePostLikerPage;
        return await Promise.all(
            (page.likers ?? []).map(async ({ actor }) => {
                const profile = actorProfile(actor);
                profile.avatarUrl = await accountAvatarURL(
                    ctx,
                    actor.spaceId,
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
    const messageText = normalizeSpaceMessageText(text);
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.reply_to_post(BigInt(postId), messageText);
    } finally {
        ctx.free();
    }
};

export const sendCurrentMessage = async (spaceId: string, text: string) => {
    const messageText = normalizeSpaceMessageText(text);
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await messageFromSpaceMessage(
            ctx,
            (await ctx.send_message(
                spaceId,
                messageText,
            )) as SpaceMessageResponse,
            true,
        );
    } finally {
        ctx.free();
    }
};

export const replyToCurrentMessage = async (
    spaceId: string,
    messageId: string,
    text: string,
) => {
    const messageText = normalizeSpaceMessageText(text);
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await messageFromSpaceMessage(
            ctx,
            (await ctx.reply_to_message(
                spaceId,
                messageId,
                messageText,
            )) as SpaceMessageResponse,
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
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.like_message(messageId, liked);
    } finally {
        ctx.free();
    }
};

export const deleteCurrentMessage = async (messageId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.delete_message(messageId);
    } finally {
        ctx.free();
    }
};

export const loadCurrentMessageConversations =
    async (): Promise<SpaceMessageConversationPage> => {
        const ctx = await ensureCurrentSpaceContext();
        try {
            const page = (await ctx.list_message_conversations(
                null,
                50,
            )) as SpaceMessageConversationPageResponse;
            const items = await Promise.all(
                (page.items ?? []).map(async (conversation) => {
                    const friend = actorProfile(conversation.friend);
                    friend.avatarUrl = await accountAvatarURL(
                        ctx,
                        conversation.friend.spaceId,
                        conversation.friend.avatar,
                    );
                    return {
                        friend,
                        latestActivity: await messageActivityFromSpaceActivity(
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
    spaceId: string,
): Promise<SpaceMessagePage> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const page = (await ctx.list_message_thread(
            spaceId,
            null,
            100,
        )) as SpaceMessagePageResponse;
        const items = (
            await Promise.all(
                (page.items ?? []).map((message) =>
                    messageFromSpaceMessage(ctx, message, true),
                ),
            )
        ).reverse();
        return { items, nextCursor: page.nextCursor || undefined };
    } finally {
        ctx.free();
    }
};

export const markCurrentNotificationsRead = async (friendSpaceId: string) => {
    if (!friendSpaceId.trim()) return;
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.mark_notifications_read(friendSpaceId);
    } finally {
        ctx.free();
    }
};

export const deleteCurrentPost = async (postId: number) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.delete_post(BigInt(postId));
    } finally {
        ctx.free();
    }
};

export const loadPublicSpaceInvite = async ({
    accessKey,
    spaceUsername,
}: PendingSpaceInvite) => {
    const { space_open_link_ctx } = await loadEnteWasm();
    const ctx = await space_open_link_ctx({
        accessKey,
        baseUrl: await apiOrigin(),
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
        spaceUsername,
    });
    try {
        const spaceProfile =
            (await ctx.get_space_profile()) as SpaceProfileResponse;
        const profile = profileFromSpaceProfile(spaceProfile);
        profile.avatarUrl = await linkAvatarURL(ctx, spaceProfile.avatar);
        const posts = await postPageFromLinkPage(
            ctx,
            (await ctx.list_posts(null, 60)) as SpacePostPageResponse,
        );
        return { posts: posts.items, profile };
    } finally {
        ctx.free();
    }
};
