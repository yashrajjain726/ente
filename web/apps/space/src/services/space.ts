import type { FriendProfile } from "data/friends";
import { apiOrigin } from "ente-base/origins";
import type { SpaceAccountCtxHandle } from "ente-wasm";
import type { PendingSpaceInvite } from "services/spaceInvite";
import {
    cachedSpaceMediaBlobURL,
    rememberCachedSpaceMediaBlobURL,
    spacePostMediaCacheKey,
    spaceProfileMediaCacheKey,
} from "services/spaceMediaCache";
import {
    ensureCurrentSpaceContext,
    releaseCurrentSpaceContext,
} from "services/spaceProfile";
import {
    parseSpaceProfilePayload,
    spaceProfileTextField,
} from "services/spaceProfilePayload";
import { normalizeSpaceMessageText } from "utils/spaceMessageLimits";

export { clearSpaceMediaURLCache } from "services/spaceMediaCache";

const currentFeedPageSize = 10;

interface SpaceAvatar {
    objectID: string;
    size?: number;
    updatedAt?: string;
}

type SpaceCover = SpaceAvatar;

interface SpaceProfileResponse {
    avatar?: SpaceAvatar;
    cover?: SpaceCover;
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
    spaceId: string;
    spaceSlug: string;
}

interface SpacePostObject {
    height?: number;
    mediaType?: string;
    objectKey: string;
    size?: number;
    width?: number;
}

interface SpacePostResponse {
    author: SpaceActor;
    caption?: string;
    createdAt: string;
    encryptedPostKey: string;
    keyVersion: number;
    objects?: SpacePostObject[];
    postId: number;
    viewerLiked: boolean;
    spaceId: string;
    spaceSlug: string;
}

interface SpacePostPageResponse {
    items?: SpacePostResponse[];
    nextCursor?: string;
}

type SpaceMessageConversationActivityType =
    | "friend"
    | "friend_request"
    | "message"
    | "message_like"
    | "post_like"
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
    outgoing?: boolean;
    post?: SpaceMessageConversationPostResponse;
    type: SpaceMessageConversationActivityType;
}

interface SpaceFriend {
    createdAt: string;
    friend: SpaceActor;
    shareKeyVersion: number;
}

type SpaceMessageKindResponse = "post_like" | "post_reply" | "regular";

interface SpaceMessageQuoteResponse {
    caption?: string;
    encryptedPostKey?: string;
    height?: number;
    keyVersion?: number;
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
    notificationUnread?: boolean;
    unread?: boolean;
    unreadCount: number;
}

interface SpaceMessageConversationPageResponse {
    items?: SpaceMessageConversationResponse[];
    nextCursor?: string;
}

interface SpaceFriendRequestResponse {
    requestId: number;
    requester: SpaceActor;
    createdAt: string;
}

interface SpacePostBase {
    avatarObjectID?: string;
    avatarSize?: number;
    avatarUpdatedAt?: string;
    avatarUrl?: string | null;
    caption?: string;
    friendID: string;
    height?: number;
    name: string;
    postId: number;
    timestampMs: number;
    viewerLiked: boolean;
    spaceId: string;
    width?: number;
}

export interface SpacePostAsset {
    encryptedPostKey: string;
    keyVersion: number;
    mediaType?: string;
    objectKey: string;
    postId: number;
    spaceId: string;
}

export interface SpacePost extends SpacePostBase {
    imageAsset?: SpacePostAsset;
    imageUrl?: string;
}

export interface SpacePostPage {
    items: SpacePost[];
    nextCursor?: string;
}

export interface SpaceProfilePost extends SpacePostBase {
    imageAsset?: SpacePostAsset;
    imageUrl?: string;
}

export interface SpaceProfilePostPage {
    items: SpaceProfilePost[];
    nextCursor?: string;
}

export type SpacePostAssetURLLoader = (
    asset: SpacePostAsset,
) => Promise<string>;

export type SpacePostAvatarURLLoader = (
    post: SpacePost,
) => Promise<string | null>;

export interface PublicSpaceIdentity {
    spaceId: string;
    username: string;
}

interface PublicSpaceIdentityResponse {
    spaceId?: string;
    spaceSlug?: string;
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
    outgoing: boolean;
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
    notificationUnread: boolean;
    unread: boolean;
    unreadCount: number;
}

export interface SpaceMessageConversationPage {
    items: SpaceMessageConversation[];
    nextCursor?: string;
}

export interface SpaceUnreadStatus {
    messagesUnread: boolean;
}

interface SpaceUnreadStatusResponse {
    notificationsUnread: boolean;
}

type SpaceFriendRequestContext = SpaceAccountCtxHandle & {
    confirm_friend_request: (requestId: bigint) => Promise<unknown>;
    delete_friend_request: (requestId: bigint) => Promise<void>;
    list_friend_requests: () => Promise<SpaceFriendRequestResponse[]>;
    request_friend_by_username: (username: string) => Promise<unknown>;
};

const timestampMsFromSpaceDate = (value: string) => {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid space date: ${value}`);
    }
    return parsed;
};

const spaceFriendsCache = new Map<string, Promise<FriendProfile[]>>();

export const clearSpaceFriendsCache = () => {
    spaceFriendsCache.clear();
};

const cloneFriendProfiles = (friends: FriendProfile[]) =>
    friends.map((friend) => ({ ...friend }));

const actorProfile = (actor: SpaceActor): FriendProfile => {
    const payload = parseSpaceProfilePayload(actor.profile ?? "");
    const fullName =
        spaceProfileTextField(payload.fullName) ||
        spaceProfileTextField(payload.displayName) ||
        actor.spaceSlug;
    const username = actor.spaceSlug;

    return {
        avatarObjectID: actor.avatar?.objectID,
        avatarSize: actor.avatar?.size,
        avatarUpdatedAt: actor.avatar?.updatedAt,
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
        spaceProfileTextField(payload.fullName) ||
        spaceProfileTextField(payload.displayName) ||
        spaceProfile.spaceSlug;

    return {
        avatarObjectID: spaceProfile.avatar?.objectID,
        avatarSize: spaceProfile.avatar?.size,
        avatarUpdatedAt: spaceProfile.avatar?.updatedAt,
        avatarUrl: null,
        coverObjectID: spaceProfile.cover?.objectID,
        coverUpdatedAt: spaceProfile.cover?.updatedAt,
        coverUrl: null,
        friendsCount: spaceProfile.friends ?? 0,
        fullName,
        id: spaceProfile.spaceId || spaceProfile.spaceSlug,
        username: spaceProfile.spaceSlug,
        spaceId: spaceProfile.spaceId,
        spaceSlug: spaceProfile.spaceSlug,
    };
};

const accountCoverURL = async (
    ctx: SpaceAccountCtxHandle,
    spaceId: string | undefined,
    cover: SpaceCover | undefined,
) => {
    if (!spaceId || !cover?.objectID) return null;
    try {
        return await cachedSpaceMediaBlobURL(
            spaceProfileMediaCacheKey(spaceId, "cover", cover.objectID),
            () => ctx.download_space_cover(spaceId, cover.objectID),
        );
    } catch (error) {
        console.warn("Failed to load space cover", error);
        return null;
    }
};

const accountAvatarURL = async (
    ctx: SpaceAccountCtxHandle,
    spaceId: string | undefined,
    avatar: SpaceAvatar | undefined,
) => {
    if (!spaceId || !avatar?.objectID) return null;
    try {
        return await cachedSpaceMediaBlobURL(
            spaceProfileMediaCacheKey(spaceId, "avatar", avatar.objectID),
            () => ctx.download_space_avatar(spaceId, avatar.objectID),
        );
    } catch (error) {
        console.warn("Failed to load space avatar", error);
        return null;
    }
};

const postAssetFrom = (
    post: SpacePostResponse,
    object: SpacePostObject,
): SpacePostAsset => ({
    encryptedPostKey: post.encryptedPostKey,
    keyVersion: post.keyVersion,
    mediaType: object.mediaType,
    objectKey: object.objectKey,
    postId: post.postId,
    spaceId: post.spaceId,
});

const postAssetCacheKey = (asset: SpacePostAsset) =>
    spacePostMediaCacheKey(asset.spaceId, asset.objectKey);

const accountPostAssetURLFromAsset = (
    ctx: SpaceAccountCtxHandle,
    asset: SpacePostAsset,
) =>
    cachedSpaceMediaBlobURL(
        postAssetCacheKey(asset),
        () =>
            ctx.download_post_asset_with_key(
                asset.spaceId,
                BigInt(asset.postId),
                asset.encryptedPostKey,
                asset.keyVersion,
                asset.objectKey,
            ),
        asset.mediaType,
    );

const accountPostAssetURL = (
    ctx: SpaceAccountCtxHandle,
    post: SpacePostResponse,
    object: SpacePostObject,
) => accountPostAssetURLFromAsset(ctx, postAssetFrom(post, object));

const cacheAccountPostAssetURL = async (
    post: SpacePostResponse,
    object: SpacePostObject,
    blob: Blob,
) => {
    const key = postAssetCacheKey(postAssetFrom(post, object));
    await rememberCachedSpaceMediaBlobURL(key, blob);
};

const accountPostAssetURLByPostId = (
    ctx: SpaceAccountCtxHandle,
    spaceId: string,
    postId: number,
    objectKey: string,
    mediaType?: string,
) =>
    cachedSpaceMediaBlobURL(
        spacePostMediaCacheKey(spaceId, objectKey),
        () => ctx.download_post_asset(BigInt(postId), objectKey),
        mediaType,
    );

const accountPostAssetURLFromQuote = (
    ctx: SpaceAccountCtxHandle,
    quote: SpaceMessageQuoteResponse,
) => {
    if (
        !quote.objectKey ||
        !quote.encryptedPostKey ||
        typeof quote.keyVersion != "number"
    ) {
        return undefined;
    }

    return cachedSpaceMediaBlobURL(
        spacePostMediaCacheKey(quote.spaceId, quote.objectKey),
        () =>
            ctx.download_post_asset_with_key(
                quote.spaceId,
                BigInt(quote.postId),
                quote.encryptedPostKey!,
                quote.keyVersion!,
                quote.objectKey!,
            ),
        quote.mediaType,
    );
};

const firstObject = (post: { objects?: SpacePostObject[] }) =>
    post.objects?.find((object) => object.objectKey.trim()) ?? null;

const postFromAccountPost = async (
    ctx: SpaceAccountCtxHandle,
    post: SpacePostResponse,
    loadMedia = true,
): Promise<SpacePost | null> => {
    const object = firstObject(post);
    if (!object) return null;

    const author = actorProfile(post.author);
    if (loadMedia) {
        author.avatarUrl = await accountAvatarURL(
            ctx,
            post.author.spaceId,
            post.author.avatar,
        );
    }

    const imageUrl = loadMedia
        ? await accountPostAssetURL(ctx, post, object)
        : undefined;
    return {
        avatarObjectID: author.avatarObjectID,
        avatarSize: author.avatarSize,
        avatarUpdatedAt: author.avatarUpdatedAt,
        avatarUrl: author.avatarUrl,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageAsset: postAssetFrom(post, object),
        imageUrl,
        name: author.fullName || author.username,
        postId: post.postId,
        timestampMs: timestampMsFromSpaceDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        spaceId: post.spaceId,
        width: object.width,
    };
};

const profilePostFromPost = (
    post: SpacePostResponse,
): SpaceProfilePost | null => {
    const object = firstObject(post);
    if (!object) return null;

    const author = actorProfile(post.author);
    return {
        avatarObjectID: author.avatarObjectID,
        avatarSize: author.avatarSize,
        avatarUpdatedAt: author.avatarUpdatedAt,
        avatarUrl: null,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageAsset: postAssetFrom(post, object),
        name: author.fullName || author.username,
        postId: post.postId,
        timestampMs: timestampMsFromSpaceDate(post.createdAt),
        viewerLiked: post.viewerLiked,
        spaceId: post.spaceId,
        width: object.width,
    };
};

const postPageFromAccountPage = async (
    ctx: SpaceAccountCtxHandle,
    page: SpacePostPageResponse,
    loadMedia = true,
): Promise<SpacePostPage> => {
    const items = (
        await Promise.all(
            (page.items ?? []).map((post) =>
                postFromAccountPost(ctx, post, loadMedia),
            ),
        )
    ).filter((post): post is SpacePost => Boolean(post));
    return { items, nextCursor: page.nextCursor || undefined };
};

const profilePostPageFromPage = (
    page: SpacePostPageResponse,
): SpaceProfilePostPage => ({
    items: (page.items ?? [])
        .map(profilePostFromPost)
        .filter((post): post is SpaceProfilePost => Boolean(post)),
    nextCursor: page.nextCursor || undefined,
});

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
        const imageUrl = await accountPostAssetURLFromQuote(ctx, quote);
        if (!imageUrl) {
            spaceQuote.isUnavailable = true;
            return spaceQuote;
        }
        spaceQuote.imageUrl = imageUrl;
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
        spacePost.imageUrl = await accountPostAssetURLByPostId(
            ctx,
            post.spaceId,
            post.postId,
            object.objectKey,
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
        outgoing: Boolean(activity.outgoing),
        post,
        type: activity.type,
    };
};

export const joinSpaceInvite = async ({
    spaceUsername,
}: PendingSpaceInvite): Promise<"friend" | "requested"> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const response = (await (
            ctx as SpaceFriendRequestContext
        ).request_friend_by_username(spaceUsername)) as { status?: string };
        return response.status == "friend" ? "friend" : "requested";
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadPublicSpaceIdentity = async (
    username: string,
): Promise<PublicSpaceIdentity> => {
    const response = await fetch(
        `${await apiOrigin()}/space/public/by-slug/${encodeURIComponent(username)}`,
    );
    if (!response.ok) throw new Error("Public space lookup failed.");

    const identity = (await response.json()) as PublicSpaceIdentityResponse;
    const spaceId = identity.spaceId?.trim();
    const spaceSlug = identity.spaceSlug?.trim();
    if (!spaceId || !spaceSlug) throw new Error("Public space is invalid.");
    return { spaceId, username: spaceSlug };
};

export const loadCurrentSpaceFriends = async (spaceId: string) => {
    const cached = spaceFriendsCache.get(spaceId);
    if (cached) return cloneFriendProfiles(await cached);

    const ctx = await ensureCurrentSpaceContext();
    const promise = (async () => {
        const friends = (await ctx.list_space_friends(
            spaceId,
        )) as SpaceFriend[];
        return friends.map(({ friend }) => actorProfile(friend));
    })();
    spaceFriendsCache.set(spaceId, promise);

    try {
        return cloneFriendProfiles(await promise);
    } catch (error) {
        if (spaceFriendsCache.get(spaceId) == promise) {
            spaceFriendsCache.delete(spaceId);
        }
        throw error;
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpaceFriendsCount = async (spaceId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const spaceProfile = (await ctx.get_space_profile(
            spaceId,
        )) as SpaceProfileResponse;
        return spaceProfile.friends ?? 0;
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpaceProfile = async (
    spaceId: string,
): Promise<FriendProfile> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const spaceProfile = (await ctx.get_space_profile(
            spaceId,
        )) as SpaceProfileResponse;
        const profile = profileFromSpaceProfile(spaceProfile);
        const [avatarUrl, coverUrl] = await Promise.all([
            accountAvatarURL(ctx, spaceProfile.spaceId, spaceProfile.avatar),
            accountCoverURL(ctx, spaceProfile.spaceId, spaceProfile.cover),
        ]);
        profile.avatarUrl = avatarUrl;
        profile.coverUrl = coverUrl;
        return profile;
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const removeCurrentSpaceFriend = async (spaceId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.remove_friend_by_space(spaceId);
        clearSpaceFriendsCache();
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentFeedPage = async (
    cursor?: string,
): Promise<SpacePostPage> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await postPageFromAccountPage(
            ctx,
            (await ctx.list_feed(
                cursor ?? null,
                currentFeedPageSize,
            )) as SpacePostPageResponse,
            false,
        );
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentUnreadStatus = async (): Promise<SpaceUnreadStatus> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const status = (await ctx.unread_status()) as SpaceUnreadStatusResponse;
        return { messagesUnread: status.notificationsUnread };
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpaceProfilePostsPage = async (
    spaceId: string,
    cursor?: string,
): Promise<SpaceProfilePostPage> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return profilePostPageFromPage(
            (await ctx.list_posts(
                spaceId,
                cursor ?? null,
                60,
            )) as SpacePostPageResponse,
        );
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpacePost = async (
    spaceId: string,
    postId: number,
): Promise<SpacePost | null> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const post = await postFromAccountPost(
            ctx,
            (await ctx.get_post(BigInt(postId))) as SpacePostResponse,
        );
        return post?.spaceId == spaceId ? post : null;
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpacePostAssetURL: SpacePostAssetURLLoader = async (
    asset,
) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        return await accountPostAssetURLFromAsset(ctx, asset);
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentSpacePostAvatarURL: SpacePostAvatarURLLoader = async (
    post,
) => {
    if (!post.spaceId || !post.avatarObjectID) return null;

    const ctx = await ensureCurrentSpaceContext();
    try {
        return await accountAvatarURL(ctx, post.spaceId, {
            objectID: post.avatarObjectID,
            size: post.avatarSize,
            updatedAt: post.avatarUpdatedAt,
        });
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const loadCurrentFriendAvatarURL = async (
    friend: FriendProfile,
): Promise<string | null> => {
    if (!friend.spaceId || !friend.avatarObjectID) return null;

    const ctx = await ensureCurrentSpaceContext();
    try {
        return await accountAvatarURL(ctx, friend.spaceId, {
            objectID: friend.avatarObjectID,
            size: friend.avatarSize,
            updatedAt: friend.avatarUpdatedAt,
        });
    } finally {
        releaseCurrentSpaceContext(ctx);
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
        const object = firstObject(created);
        if (object) await cacheAccountPostAssetURL(created, object, file);
        return await postFromAccountPost(ctx, created);
    } finally {
        releaseCurrentSpaceContext(ctx);
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
        releaseCurrentSpaceContext(ctx);
    }
};

export const replyToCurrentPost = async (postId: number, text: string) => {
    const messageText = normalizeSpaceMessageText(text);
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.reply_to_post(BigInt(postId), messageText);
    } finally {
        releaseCurrentSpaceContext(ctx);
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
        releaseCurrentSpaceContext(ctx);
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
        releaseCurrentSpaceContext(ctx);
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
        releaseCurrentSpaceContext(ctx);
    }
};

export const deleteCurrentMessage = async (messageId: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.delete_message(messageId);
    } finally {
        releaseCurrentSpaceContext(ctx);
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
                        notificationUnread: Boolean(
                            conversation.notificationUnread,
                        ),
                        unread: Boolean(conversation.unread),
                        unreadCount: conversation.unreadCount,
                    };
                }),
            );
            return { items, nextCursor: page.nextCursor || undefined };
        } finally {
            releaseCurrentSpaceContext(ctx);
        }
    };

export const loadCurrentFriendRequestConversations =
    async (): Promise<SpaceMessageConversation[]> => {
        const ctx = await ensureCurrentSpaceContext();
        try {
            const requests: SpaceFriendRequestResponse[] = await (
                ctx as SpaceFriendRequestContext
            ).list_friend_requests();
            return (requests ?? []).map((request) => ({
                friend: actorProfile(request.requester),
                latestActivity: {
                    createdAtMs: timestampMsFromSpaceDate(request.createdAt),
                    id: `friend_request:${request.requestId}`,
                    outgoing: false,
                    type: "friend_request",
                },
                notificationUnread: true,
                unread: true,
                unreadCount: 1,
            }));
        } finally {
            releaseCurrentSpaceContext(ctx);
        }
    };

export const confirmCurrentFriendRequest = async (requestId: number) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await (ctx as SpaceFriendRequestContext).confirm_friend_request(
            BigInt(requestId),
        );
        clearSpaceFriendsCache();
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const deleteCurrentFriendRequest = async (requestId: number) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await (ctx as SpaceFriendRequestContext).delete_friend_request(
            BigInt(requestId),
        );
    } finally {
        releaseCurrentSpaceContext(ctx);
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
        releaseCurrentSpaceContext(ctx);
    }
};

export const markCurrentMessagesRead = async (friendSpaceId: string) => {
    if (!friendSpaceId.trim()) return;
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.mark_notifications_read(friendSpaceId);
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const deleteCurrentPost = async (postId: number) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.delete_post(BigInt(postId));
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};
