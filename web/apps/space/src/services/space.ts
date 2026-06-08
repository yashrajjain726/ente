import type { FriendProfile } from "data/friends";
import { clientPackageName, desktopAppVersion, isDesktop } from "ente-base/app";
import { apiOrigin } from "ente-base/origins";
import type { SpaceAccountCtxHandle, SpaceLinkCtxHandle } from "ente-wasm";
import { loadEnteWasm } from "ente-wasm/load";
import type { PendingSpaceInvite } from "services/spaceInvite";
import { spaceInviteURL } from "services/spaceInvite";
import {
    ensureCurrentSpaceContext,
    releaseCurrentSpaceContext,
} from "services/spaceProfile";
import { normalizeSpaceMessageText } from "utils/spaceMessageLimits";

const currentFeedPageSize = 10;
const postLikersPageSize = 100;

interface SpaceAvatar {
    objectKey: string;
    size?: number;
    updatedAt?: string;
}

type SpaceCover = SpaceAvatar;

interface SpaceProfilePayload {
    displayName?: unknown;
    fullName?: unknown;
    username?: unknown;
}

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
    userId?: number;
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
    likes?: number;
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

interface SpacePostLikerResponse {
    actor: SpaceActor;
    createdAt: string;
}

interface SpacePostLikersPageResponse {
    likers?: SpacePostLikerResponse[];
    nextCursor?: string;
}

type SpaceMessageConversationActivityType =
    | "message"
    | "message_like"
    | "post_reply";

export type SpaceNotificationType =
    | "friend_add"
    | "friend_remove"
    | "post_like";

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

type SpaceMessageKindResponse = "post_reply" | "regular";

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
    latestActivity?: SpaceMessageConversationActivity;
    unread?: boolean;
    unreadCount: number;
}

interface SpaceMessageConversationPageResponse {
    items?: SpaceMessageConversationResponse[];
    nextCursor?: string;
}

interface SpaceNotificationResponse {
    actor: SpaceActor;
    createdAt: string;
    id: string;
    post?: SpaceMessageConversationPostResponse;
    type: SpaceNotificationType;
    unread?: boolean;
}

interface SpaceNotificationPageResponse {
    items?: SpaceNotificationResponse[];
    nextCursor?: string;
}

interface SpacePostBase {
    avatarObjectKey?: string;
    avatarSize?: number;
    avatarUpdatedAt?: string;
    avatarUrl?: string | null;
    caption?: string;
    friendID: string;
    height?: number;
    likeCount: number;
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

export interface SpacePostLiker {
    createdAtMs: number;
    profile: FriendProfile;
}

export type SpacePostLikersLoader = (
    postId: number,
) => Promise<SpacePostLiker[]>;

export type SpacePostAssetURLLoader = (
    asset: SpacePostAsset,
) => Promise<string>;

export type SpacePostAvatarURLLoader = (
    post: SpacePost,
) => Promise<string | null>;

export interface SpaceLink {
    accessKey: string;
    url: string;
    spaceId: string;
    spaceSlug: string;
    spaceUsername: string;
}

export interface PublicSpaceInvite {
    close: () => void;
    loadPostAssetURL: SpacePostAssetURLLoader;
    posts: SpaceProfilePost[];
    profile: FriendProfile;
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
    latestActivity?: SpaceMessageActivity;
    unread: boolean;
    unreadCount: number;
}

export interface SpaceMessageConversationPage {
    items: SpaceMessageConversation[];
    nextCursor?: string;
}

export interface SpaceNotification {
    actor: FriendProfile;
    createdAt: string;
    createdAtMs: number;
    id: string;
    post?: SpaceMessageActivityPost;
    type: SpaceNotificationType;
    unread: boolean;
}

export interface SpaceNotificationPage {
    items: SpaceNotification[];
    nextCursor?: string;
}

export interface SpaceUnreadStatus {
    messageLikesUnread: boolean;
    messagesUnread: boolean;
    notificationsUnread: boolean;
}

interface SpaceUnreadStatusResponse {
    messageLikesUnread?: boolean;
    messagesUnread?: boolean;
    notificationsUnread: boolean;
}

const parseSpaceProfilePayload = (profile: string): SpaceProfilePayload => {
    const trimmed = profile.trim();
    if (!trimmed) return {};
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed != "object" || Array.isArray(parsed)) {
        throw new Error("Space profile payload must be a JSON object.");
    }
    return parsed as SpaceProfilePayload;
};

const textField = (value: unknown) =>
    typeof value == "string" ? value.trim() : "";

const timestampMsFromSpaceDate = (value: string) => {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid space date: ${value}`);
    }
    return parsed;
};

const blobURLForBytes = (bytes: Uint8Array, mediaType?: string) =>
    URL.createObjectURL(new Blob([bytes], { type: mediaType || undefined }));

const maxSpaceMediaCacheEntries = 128;
const spaceMediaURLCache = new Map<string, Promise<string>>();
const spaceFriendsCache = new Map<string, Promise<FriendProfile[]>>();

const trimSpaceMediaURLCache = () => {
    while (spaceMediaURLCache.size > maxSpaceMediaCacheEntries) {
        const oldest = spaceMediaURLCache.entries().next().value;
        if (!oldest) break;
        spaceMediaURLCache.delete(oldest[0]);
        void oldest[1].then(
            (url) => URL.revokeObjectURL(url),
            () => undefined,
        );
    }
};

const cachedBlobURL = (
    key: string,
    load: () => Promise<Uint8Array>,
    mediaType?: string,
) => {
    const cached = spaceMediaURLCache.get(key);
    if (cached) {
        spaceMediaURLCache.delete(key);
        spaceMediaURLCache.set(key, cached);
        return cached;
    }

    const promise = load()
        .then((bytes) => blobURLForBytes(bytes, mediaType))
        .catch((error: unknown) => {
            spaceMediaURLCache.delete(key);
            throw error;
        });
    spaceMediaURLCache.set(key, promise);
    trimSpaceMediaURLCache();

    return promise;
};

const rememberCachedBlobURL = (key: string, url: string) => {
    spaceMediaURLCache.set(key, Promise.resolve(url));
    trimSpaceMediaURLCache();
};

export const clearSpaceMediaURLCache = () => {
    for (const promise of spaceMediaURLCache.values()) {
        void promise.then(
            (url) => URL.revokeObjectURL(url),
            () => undefined,
        );
    }
    spaceMediaURLCache.clear();
};

export const clearSpaceFriendsCache = () => {
    spaceFriendsCache.clear();
};

const cloneFriendProfiles = (friends: FriendProfile[]) =>
    friends.map((friend) => ({ ...friend }));

const actorProfile = (actor: SpaceActor): FriendProfile => {
    const payload = parseSpaceProfilePayload(actor.profile ?? "");
    const fullName =
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        actor.spaceSlug;
    const username = actor.spaceSlug;

    return {
        avatarObjectKey: actor.avatar?.objectKey,
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
        textField(payload.fullName) ||
        textField(payload.displayName) ||
        spaceProfile.spaceSlug;

    return {
        avatarObjectKey: spaceProfile.avatar?.objectKey,
        avatarSize: spaceProfile.avatar?.size,
        avatarUpdatedAt: spaceProfile.avatar?.updatedAt,
        avatarUrl: null,
        coverObjectKey: spaceProfile.cover?.objectKey,
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
    if (!spaceId || !cover?.objectKey) return null;
    try {
        return await cachedBlobURL(
            [
                "cover",
                spaceId,
                cover.objectKey,
                cover.updatedAt ?? "",
                cover.size ?? "",
            ].join(":"),
            () => ctx.download_space_cover(spaceId, cover.objectKey),
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
    if (!spaceId || !avatar?.objectKey) return null;
    try {
        return await cachedBlobURL(
            [
                "avatar",
                spaceId,
                avatar.objectKey,
                avatar.updatedAt ?? "",
                avatar.size ?? "",
            ].join(":"),
            () => ctx.download_space_avatar(spaceId, avatar.objectKey),
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
    ["post", asset.spaceId, asset.objectKey].join(":");

const accountPostAssetURLFromAsset = (
    ctx: SpaceAccountCtxHandle,
    asset: SpacePostAsset,
) =>
    cachedBlobURL(
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

const cacheAccountPostAssetURL = (
    post: SpacePostResponse,
    object: SpacePostObject,
    blob: Blob,
) => {
    const key = postAssetCacheKey(postAssetFrom(post, object));
    if (spaceMediaURLCache.has(key)) return;

    rememberCachedBlobURL(key, URL.createObjectURL(blob));
};

const accountPostAssetURLByPostId = (
    ctx: SpaceAccountCtxHandle,
    spaceId: string,
    postId: number,
    objectKey: string,
    mediaType?: string,
) =>
    cachedBlobURL(
        ["post", spaceId, objectKey].join(":"),
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

    return cachedBlobURL(
        ["post", quote.spaceId, quote.objectKey].join(":"),
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

const linkAvatarURL = async (
    ctx: SpaceLinkCtxHandle,
    avatar: SpaceAvatar | undefined,
    cache?: Map<string, Promise<string | null>>,
) => {
    if (!avatar?.objectKey) return null;
    const cached = cache?.get(avatar.objectKey);
    if (cached) return cached;

    const promise = ctx
        .download_space_avatar(avatar.objectKey)
        .then((bytes) => blobURLForBytes(bytes));
    cache?.set(avatar.objectKey, promise);
    return promise;
};

const linkCoverURL = async (
    ctx: SpaceLinkCtxHandle,
    cover: SpaceCover | undefined,
    cache?: Map<string, Promise<string | null>>,
) => {
    if (!cover?.objectKey) return null;
    const cached = cache?.get(cover.objectKey);
    if (cached) return cached;

    const promise = ctx
        .download_space_cover(cover.objectKey)
        .then((bytes) => blobURLForBytes(bytes));
    cache?.set(cover.objectKey, promise);
    return promise;
};

const linkPostAssetURL = (
    ctx: SpaceLinkCtxHandle,
    asset: SpacePostAsset,
    cache: Map<string, Promise<string>>,
) => {
    const key = postAssetCacheKey(asset);
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = ctx
        .download_post_asset_with_key(
            BigInt(asset.postId),
            asset.encryptedPostKey,
            asset.keyVersion,
            asset.objectKey,
        )
        .then((bytes) => blobURLForBytes(bytes, asset.mediaType))
        .catch((error: unknown) => {
            cache.delete(key);
            throw error;
        });
    cache.set(key, promise);
    return promise;
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
        avatarObjectKey: author.avatarObjectKey,
        avatarSize: author.avatarSize,
        avatarUpdatedAt: author.avatarUpdatedAt,
        avatarUrl: author.avatarUrl,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageAsset: postAssetFrom(post, object),
        imageUrl,
        likeCount: post.likes ?? 0,
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
        avatarObjectKey: author.avatarObjectKey,
        avatarSize: author.avatarSize,
        avatarUpdatedAt: author.avatarUpdatedAt,
        avatarUrl: null,
        caption: post.caption,
        friendID: author.id,
        height: object.height,
        imageAsset: postAssetFrom(post, object),
        likeCount: post.likes ?? 0,
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

const postLikerFromResponse = async (
    ctx: SpaceAccountCtxHandle,
    liker: SpacePostLikerResponse,
): Promise<SpacePostLiker> => {
    const profile = actorProfile(liker.actor);
    profile.avatarUrl = await accountAvatarURL(
        ctx,
        liker.actor.spaceId,
        liker.actor.avatar,
    );
    return { createdAtMs: timestampMsFromSpaceDate(liker.createdAt), profile };
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
    activity?: SpaceMessageConversationActivity,
): Promise<SpaceMessageActivity | undefined> => {
    if (!activity) return undefined;
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

const notificationFromSpaceNotification = async (
    ctx: SpaceAccountCtxHandle,
    notification: SpaceNotificationResponse,
): Promise<SpaceNotification> => {
    const actor = actorProfile(notification.actor);
    const [avatarUrl, post] = await Promise.all([
        accountAvatarURL(
            ctx,
            notification.actor.spaceId,
            notification.actor.avatar,
        ),
        messageActivityPostFromSpacePost(ctx, notification.post),
    ]);
    actor.avatarUrl = avatarUrl;
    return {
        actor,
        createdAt: notification.createdAt,
        createdAtMs: timestampMsFromSpaceDate(notification.createdAt),
        id: notification.id,
        post,
        type: notification.type,
        unread: Boolean(notification.unread),
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
        releaseCurrentSpaceContext(ctx);
    }
};

export const joinSpaceInvite = async ({
    accessKey,
    spaceUsername,
}: PendingSpaceInvite) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.join_space_link(spaceUsername, accessKey);
        clearSpaceFriendsCache();
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
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
        const messagesUnread = Boolean(status.messagesUnread);
        const messageLikesUnread = Boolean(status.messageLikesUnread);
        return {
            messageLikesUnread,
            messagesUnread,
            notificationsUnread: Boolean(status.notificationsUnread),
        };
    } finally {
        releaseCurrentSpaceContext(ctx);
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
    if (!post.spaceId || !post.avatarObjectKey) return null;

    const ctx = await ensureCurrentSpaceContext();
    try {
        return await accountAvatarURL(ctx, post.spaceId, {
            objectKey: post.avatarObjectKey,
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
    if (!friend.spaceId || !friend.avatarObjectKey) return null;

    const ctx = await ensureCurrentSpaceContext();
    try {
        return await accountAvatarURL(ctx, friend.spaceId, {
            objectKey: friend.avatarObjectKey,
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
        if (object) cacheAccountPostAssetURL(created, object, file);
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

export const loadCurrentPostLikers = async (
    postId: number,
): Promise<SpacePostLiker[]> => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        const likers: SpacePostLiker[] = [];
        let cursor: string | undefined;
        do {
            const page = (await ctx.list_post_likers(
                BigInt(postId),
                cursor ?? null,
                postLikersPageSize,
            )) as SpacePostLikersPageResponse;
            likers.push(
                ...(await Promise.all(
                    (page.likers ?? []).map((liker) =>
                        postLikerFromResponse(ctx, liker),
                    ),
                )),
            );
            cursor = page.nextCursor || undefined;
        } while (cursor);
        return likers;
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

export const loadCurrentNotifications =
    async (): Promise<SpaceNotificationPage> => {
        const ctx = await ensureCurrentSpaceContext();
        try {
            const page = (await ctx.list_notifications(
                null,
                100,
            )) as SpaceNotificationPageResponse;
            const items = await Promise.all(
                (page.items ?? []).map((notification) =>
                    notificationFromSpaceNotification(ctx, notification),
                ),
            );
            return { items, nextCursor: page.nextCursor || undefined };
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
        await ctx.mark_message_thread_read(friendSpaceId);
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const markCurrentNotificationsRead = async (readAt?: string) => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.mark_notifications_read(readAt ?? null);
    } finally {
        releaseCurrentSpaceContext(ctx);
    }
};

export const markCurrentMessageLikesRead = async () => {
    const ctx = await ensureCurrentSpaceContext();
    try {
        await ctx.mark_message_likes_read();
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

export const loadPublicSpaceInvite = async ({
    accessKey,
    spaceUsername,
}: PendingSpaceInvite): Promise<PublicSpaceInvite> => {
    const { space_open_link_ctx } = await loadEnteWasm();
    const ctx = await space_open_link_ctx({
        accessKey,
        baseUrl: await apiOrigin(),
        clientPackage: clientPackageName,
        clientVersion: isDesktop ? desktopAppVersion : undefined,
        spaceUsername,
    });
    let didReturn = false;
    try {
        const avatarCache = new Map<string, Promise<string | null>>();
        const postAssetCache = new Map<string, Promise<string>>();
        const spaceProfile =
            (await ctx.get_space_profile()) as SpaceProfileResponse;
        const profile = profileFromSpaceProfile(spaceProfile);
        const [avatarUrl, coverUrl] = await Promise.all([
            linkAvatarURL(ctx, spaceProfile.avatar, avatarCache),
            linkCoverURL(ctx, spaceProfile.cover, avatarCache),
        ]);
        profile.avatarUrl = avatarUrl;
        profile.coverUrl = coverUrl;
        const posts = profilePostPageFromPage(
            (await ctx.list_posts(null, 60)) as SpacePostPageResponse,
        );
        const profileMediaURLs = [avatarUrl, coverUrl].filter(
            (url): url is string => Boolean(url?.startsWith("blob:")),
        );
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            profileMediaURLs.forEach((url) => URL.revokeObjectURL(url));
            const postAssetLoads = [...postAssetCache.values()];
            for (const promise of postAssetCache.values()) {
                void promise.then(
                    (url) => URL.revokeObjectURL(url),
                    () => undefined,
                );
            }
            if (postAssetLoads.length) {
                void Promise.allSettled(postAssetLoads).finally(() =>
                    ctx.free(),
                );
            } else {
                ctx.free();
            }
        };
        const loadPostAssetURL: SpacePostAssetURLLoader = (asset) => {
            if (closed)
                return Promise.reject(new Error("Space link is closed."));
            return linkPostAssetURL(ctx, asset, postAssetCache);
        };
        didReturn = true;
        return { close, loadPostAssetURL, posts: posts.items, profile };
    } finally {
        if (!didReturn) ctx.free();
    }
};
