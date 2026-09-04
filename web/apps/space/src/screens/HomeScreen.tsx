import { UserAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import {
    SpaceActionToast,
    spaceToastAutoDismissDurationMs,
} from "components/ActionToast";
import { SpaceAvatarImage } from "components/AvatarImage";
import {
    SpaceFileViewer,
    SpaceViewerPostBackdrop,
    type SpaceViewerPhoto,
    type SpaceViewerPostActionMode,
} from "components/FileViewer";
import { SpaceHomeHeader, spaceHomeHeaderHeight } from "components/HomeHeader";
import { SpacePostFloatingActionButton } from "components/PostFloatingActionButton";
import {
    SpacePostBadge,
    SpacePostUnreadBadge,
} from "components/PostUnreadBadge";
import { SpacePWAInstallPrompt } from "components/PWAInstallPrompt";
import { SpaceLoadingSpinner } from "components/RouteFallback";
import { SpaceShareInviteButton } from "components/ShareInviteButton";
import type { FriendProfile } from "data/friends";
import log from "ente-base/log";
import { useBrowserBackClose } from "hooks/use-browser-back-close";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { markSpaceHomePostRead } from "services/home-posts";
import {
    isSpaceContentError,
    type SpaceFriendRequest,
    type SpacePost,
    type SpacePostAssetURLLoader,
} from "services/space";
import { spaceAppBackground, spaceText, spaceTextMuted } from "styles/colors";
import { firstNameFrom } from "utils/display";
import {
    homeTileGridLayout,
    homeTilePlacements,
    usesHomeTileGrid,
    type HomeTilePlacement,
} from "utils/home-tile-layout";
import { createLoadedLocalPostPhoto } from "utils/local-post-photo";
import {
    canPreviewSpaceImageFile,
    spacePostImageErrorMessage,
    spacePostImageInputAccept,
    spacePostPreviewImageForFile,
    type SpaceDraftPostImage,
} from "utils/post-image";
import { thumbHashDataURLFromBase64 } from "utils/thumbhash";

const green = "#08C225";
const textBase = spaceText;
const textSecondary = spaceTextMuted;
const avatarFallbackColor = "#888888";
const avatarFallbackTextColor = "#FFFFFF";
const mediaPlaceholderColor = "#E5E7EA";
const homeHorizontalPadding = "16px";
const postTileMediaLoadRootMargin = "640px 0px";
const waveAnimationDurationMs = 1100;
const waveHoldDurationMs = 500;
const waveHoldMovementTolerancePx = 12;
interface HomeScreenProps {
    latestPosts: SpacePost[];
    unreadPosts: SpacePost[];
    friendRequestSentToastName?: string;
    friends: FriendProfile[];
    sentFriendRequests: SpaceFriendRequest[];
    hasUnreadMessages?: boolean;
    isLatestPostsLoading?: boolean;
    isFriendsLoading?: boolean;
    isFriendRequestsLoading?: boolean;
    showInstallPrompt?: boolean;
    onCreatePost?: (
        image: SpaceDraftPostImage,
        caption: string,
    ) => Promise<void>;
    onLoadFriendAvatar?: (friend: FriendProfile) => Promise<string | null>;
    onLoadPostImage?: SpacePostAssetURLLoader;
    onFriendRequestSentToastClose?: () => void;
    onOpenFriend?: (friendID: string, username?: string) => void;
    onOpenFriendRequests?: () => void;
    onOpenMessages?: () => void;
    onOpenProfile?: () => void;
    onReplyToPost?: (
        postSpaceId: string,
        postId: number,
        text: string,
    ) => Promise<void>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    onWaveFriend?: (friend: FriendProfile) => Promise<void>;
    profile: SetupProfile | null;
    profileLink?: string;
    viewerSpaceId?: string;
}

interface DecodedImageState {
    failed?: boolean;
    height?: number;
    ready: boolean;
    src?: string | null;
    width?: number;
}

interface PostTileCanvasSize {
    height: number;
    width: number;
}

interface SelectedHomeViewer {
    avatarUrl?: string | null;
    draftFile?: File;
    draftImageError?: string;
    focusReplyOnOpen?: boolean;
    friend?: FriendProfile;
    isDraftImagePreviewPending?: boolean;
    localObjectUrl?: string;
    photo: SpaceViewerPhoto;
    postIndex?: number;
    postActionMode?: SpaceViewerPostActionMode;
    posts?: SpacePost[];
}

interface AddedFriendToastProps {
    message: string;
    onClose?: () => void;
}

const viewerPhotoForPost = (
    post: SpacePost,
    friend: FriendProfile,
    avatarUrl: string | null | undefined,
    imageUrl: string,
): SpaceViewerPhoto => {
    const displayName = friend.fullName.trim() || friend.username.trim();
    return {
        alt: `${displayName} post`,
        avatarUrl,
        caption: post.caption,
        friendID: post.friendID,
        height: post.height,
        imageUrl,
        name: displayName,
        postId: post.postId,
        spaceId: post.spaceId,
        timestampMs: post.timestampMs,
        username: friend.username,
        viewerLiked: post.viewerLiked,
        width: post.width,
    };
};

const postImageCacheKey = (item: SpacePost) =>
    [
        item.postId,
        item.imageAsset?.spaceId ?? item.spaceId,
        item.imageAsset?.objectKey ?? item.imageUrl ?? "",
    ].join(":");

const friendAvatarCacheKey = (friend: FriendProfile) =>
    [
        friend.spaceId ?? friend.id,
        friend.avatarKeyVersion ?? "",
        friend.avatarObjectID ?? "",
        friend.avatarUpdatedAt ?? "",
        friend.avatarSize ?? "",
    ].join(":");

const useDecodedImage = (
    src?: string | null,
    keepPreviousUntilReady = false,
): DecodedImageState => {
    const [state, setState] = useState<DecodedImageState>({ ready: !src, src });

    React.useEffect(() => {
        if (!src) {
            setState({ ready: true, src });
            return;
        }

        let cancelled = false;
        const image = new Image();

        const finish = () => {
            if (cancelled) return;

            setState({
                height: image.naturalHeight || undefined,
                ready: true,
                src,
                width: image.naturalWidth || undefined,
            });
        };
        const fail = () => {
            if (cancelled) return;
            setState({ failed: true, ready: true, src });
        };
        const decodeLoadedImage = () => {
            if (typeof image.decode != "function") {
                finish();
                return;
            }

            void image.decode().then(finish, fail);
        };

        setState((currentState) =>
            keepPreviousUntilReady && currentState.ready && currentState.src
                ? currentState
                : { ready: false, src },
        );
        image.addEventListener("load", decodeLoadedImage, { once: true });
        image.addEventListener("error", fail, { once: true });
        image.src = src;
        if (image.complete) {
            if (image.naturalWidth) decodeLoadedImage();
            else fail();
        }

        return () => {
            cancelled = true;
            image.removeEventListener("load", decodeLoadedImage);
            image.removeEventListener("error", fail);
        };
    }, [keepPreviousUntilReady, src]);

    if (state.src == src) return state;
    if (keepPreviousUntilReady && src && state.ready && state.src) return state;
    return { ready: !src, src };
};

interface FriendPostTileProps {
    avatarUrl?: string | null;
    friend: FriendProfile;
    imageUrl?: string;
    isAvatarPending: boolean;
    isLoading: boolean;
    isRead: boolean;
    isRequestPending?: boolean;
    isUnavailable: boolean;
    onLoadAvatar?: () => Promise<string | null | undefined>;
    onLoadImage?: () => Promise<string | undefined>;
    onOpenFriend?: (friendID: string, username?: string) => void;
    onOpenFriendRequest?: () => void;
    onOpenPosts: (
        friend: FriendProfile,
        posts: SpacePost[],
        photo: SpaceViewerPhoto,
    ) => void;
    onWave?: () => Promise<void>;
    placement?: HomeTilePlacement;
    posts: SpacePost[];
}

export const FriendPostTile: React.FC<FriendPostTileProps> = ({
    avatarUrl,
    friend,
    imageUrl,
    isAvatarPending,
    isLoading,
    isRead,
    isRequestPending = false,
    isUnavailable,
    onLoadAvatar,
    onLoadImage,
    onOpenFriend,
    onOpenFriendRequest,
    onOpenPosts,
    onWave,
    placement,
    posts,
}) => {
    const rootRef = React.useRef<HTMLLIElement | null>(null);
    const holdOriginRef = React.useRef<
        { pointerID: number; x: number; y: number } | undefined
    >(undefined);
    const holdTimeoutRef = React.useRef<number | undefined>(undefined);
    const suppressClickRef = React.useRef(false);
    const waveAnimationTimeoutRef = React.useRef<number | undefined>(undefined);
    const [shouldLoadMedia, setShouldLoadMedia] = useState(Boolean(imageUrl));
    const [isHoldingWave, setIsHoldingWave] = useState(false);
    const [isWaveSending, setIsWaveSending] = useState(false);
    const [waveAnimationID, setWaveAnimationID] = useState(0);
    const decodedPhoto = useDecodedImage(imageUrl, true);
    const decodedAvatar = useDecodedImage(
        avatarUrl ?? friend.avatarUrl ?? null,
        true,
    );
    const post = posts[0];
    const thumbHashDataURL = React.useMemo(
        () => thumbHashDataURLFromBase64(post?.thumbHash),
        [post?.thumbHash],
    );
    const displayName = friend.fullName.trim() || friend.username.trim();
    const firstName = firstNameFrom(displayName);
    const initial = firstName.charAt(0).toLocaleUpperCase();
    const postUnavailable = isUnavailable || decodedPhoto.failed;
    const displayImageUrl =
        (decodedPhoto.failed
            ? undefined
            : decodedPhoto.ready
              ? decodedPhoto.src
              : imageUrl) ?? undefined;
    const displayAvatarUrl =
        (decodedAvatar.failed
            ? undefined
            : decodedAvatar.ready
              ? decodedAvatar.src
              : avatarUrl) ?? null;
    const isPhotoReady = Boolean(displayImageUrl) && decodedPhoto.ready;
    const canOpenPost = Boolean(post) && !postUnavailable && isPhotoReady;
    const isTileDisabled =
        isLoading ||
        (isRequestPending && !onOpenFriendRequest) ||
        Boolean(post && !postUnavailable && !isPhotoReady);
    const avatarSize = placement ? Math.min(36, placement.size * 0.22) : "22%";

    const hasMediaToLoad =
        isAvatarPending || Boolean(post && !postUnavailable && !imageUrl);

    React.useEffect(() => {
        if (isLoading || !hasMediaToLoad || shouldLoadMedia) return;
        const element = rootRef.current;
        if (!element) return;
        if (
            typeof window == "undefined" ||
            !("IntersectionObserver" in window)
        ) {
            setShouldLoadMedia(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShouldLoadMedia(true);
                    observer.disconnect();
                }
            },
            { rootMargin: postTileMediaLoadRootMargin },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [hasMediaToLoad, isLoading, shouldLoadMedia]);

    React.useEffect(() => {
        if (!shouldLoadMedia) return;
        if (!imageUrl && !postUnavailable) void onLoadImage?.();
        if (isAvatarPending) void onLoadAvatar?.();
    }, [
        imageUrl,
        isAvatarPending,
        onLoadAvatar,
        onLoadImage,
        postUnavailable,
        shouldLoadMedia,
    ]);

    React.useEffect(
        () => () => {
            if (holdTimeoutRef.current !== undefined) {
                window.clearTimeout(holdTimeoutRef.current);
            }
            if (waveAnimationTimeoutRef.current !== undefined) {
                window.clearTimeout(waveAnimationTimeoutRef.current);
            }
        },
        [],
    );

    const cancelWaveHold = () => {
        if (holdTimeoutRef.current !== undefined) {
            window.clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = undefined;
        }
        holdOriginRef.current = undefined;
        setIsHoldingWave(false);
    };

    const suppressPendingClick = () => {
        suppressClickRef.current = true;
        window.setTimeout(() => {
            suppressClickRef.current = false;
        }, 0);
    };

    const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (
        event,
    ) => {
        if (isWaveSending || !onWave || !event.isPrimary || event.button != 0) {
            return;
        }

        cancelWaveHold();
        holdOriginRef.current = {
            pointerID: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        };
        setIsHoldingWave(true);
        holdTimeoutRef.current = window.setTimeout(() => {
            holdTimeoutRef.current = undefined;
            suppressClickRef.current = true;
            setIsHoldingWave(false);
            setWaveAnimationID((currentID) => currentID + 1);
            if (waveAnimationTimeoutRef.current !== undefined) {
                window.clearTimeout(waveAnimationTimeoutRef.current);
            }
            waveAnimationTimeoutRef.current = window.setTimeout(() => {
                waveAnimationTimeoutRef.current = undefined;
                setWaveAnimationID(0);
            }, waveAnimationDurationMs);
            setIsWaveSending(true);
            void onWave()
                .catch((error: unknown) =>
                    log.error("Failed to send wave", error),
                )
                .finally(() => setIsWaveSending(false));
        }, waveHoldDurationMs);
    };

    const handlePointerMove: React.PointerEventHandler<HTMLButtonElement> = (
        event,
    ) => {
        const origin = holdOriginRef.current;
        if (origin?.pointerID != event.pointerId) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        const moved =
            Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
            waveHoldMovementTolerancePx;
        const outside =
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom;
        if (!moved && !outside) return;

        cancelWaveHold();
        suppressClickRef.current = true;
    };

    const handlePointerEnd: React.PointerEventHandler<
        HTMLButtonElement
    > = () => {
        cancelWaveHold();
        if (suppressClickRef.current) suppressPendingClick();
    };

    const openTile = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (isRequestPending) {
            onOpenFriendRequest?.();
            return;
        }
        if (!post || postUnavailable) {
            onOpenFriend?.(friend.id, friend.username);
            return;
        }
        if (!canOpenPost || !displayImageUrl) return;

        onOpenPosts(friend, posts, {
            alt: `${displayName} post`,
            avatarUrl: displayAvatarUrl,
            caption: post.caption,
            friendID: post.friendID,
            height: decodedPhoto.height ?? post.height,
            imageUrl: displayImageUrl,
            name: displayName,
            postId: post.postId,
            spaceId: post.spaceId,
            timestampMs: post.timestampMs,
            username: friend.username,
            viewerLiked: post.viewerLiked,
            width: decodedPhoto.width ?? post.width,
        });
    };

    const openFriend = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (isRequestPending) {
            onOpenFriendRequest?.();
            return;
        }
        onOpenFriend?.(friend.id, friend.username);
    };
    const canOpenFriend = isRequestPending
        ? Boolean(onOpenFriendRequest)
        : Boolean(onOpenFriend);

    return (
        <Box
            ref={rootRef}
            component="li"
            sx={{
                aspectRatio: "1",
                listStyle: "none",
                minWidth: 0,
                position: placement ? "absolute" : "relative",
                transition: placement
                    ? "left 420ms cubic-bezier(0.2, 0.8, 0.2, 1), top 420ms cubic-bezier(0.2, 0.8, 0.2, 1), width 420ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 160ms ease-out"
                    : "transform 160ms ease-out",
                transform: isHoldingWave ? "scale(0.98)" : "scale(1)",
                width: placement?.size ?? "100%",
                ...(placement && { left: placement.x, top: placement.y }),
                "@media (prefers-reduced-motion: reduce)": {
                    transition: "none",
                    transform: "none",
                },
            }}
        >
            <Box
                component="button"
                type="button"
                aria-label={
                    isLoading
                        ? `Loading ${firstName}'s latest post`
                        : isRequestPending
                          ? `Manage friend request sent to ${firstName}`
                          : post && !postUnavailable
                            ? posts.length > 1
                                ? `Open ${posts.length} new posts from ${firstName}`
                                : isRead
                                  ? `Open ${firstName}'s latest post`
                                  : `Open ${firstName}'s new post`
                            : `Open ${firstName}'s profile`
                }
                disabled={isTileDisabled}
                onClick={openTile}
                onContextMenu={(event) => {
                    if (onWave) event.preventDefault();
                }}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                sx={{
                    alignItems: "center",
                    appearance: "none",
                    aspectRatio: "1",
                    bgcolor: isRequestPending
                        ? "rgba(8, 194, 37, 0.12)"
                        : mediaPlaceholderColor,
                    border: 0,
                    borderRadius: "20%",
                    color: textBase,
                    cursor: isTileDisabled ? "default" : "pointer",
                    display: "flex",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    height: "100%",
                    justifyContent: "center",
                    overflow: "hidden",
                    p: 0,
                    position: "relative",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                    width: "100%",
                    zIndex: 1,
                }}
            >
                {isLoading ? (
                    <Skeleton
                        variant="rectangular"
                        sx={{
                            bgcolor: mediaPlaceholderColor,
                            height: "100%",
                            transform: "none",
                            width: "100%",
                        }}
                    />
                ) : post && !postUnavailable ? (
                    <>
                        {!thumbHashDataURL && !isPhotoReady && (
                            <Skeleton
                                variant="rectangular"
                                sx={{
                                    bgcolor: mediaPlaceholderColor,
                                    height: "100%",
                                    transform: "none",
                                    width: "100%",
                                }}
                            />
                        )}
                        {thumbHashDataURL && (
                            <Box
                                component="img"
                                alt=""
                                aria-hidden
                                src={thumbHashDataURL}
                                sx={{
                                    filter: "blur(14px)",
                                    height: "100%",
                                    inset: 0,
                                    objectFit: "cover",
                                    position: "absolute",
                                    transform: "scale(1.08)",
                                    width: "100%",
                                }}
                            />
                        )}
                        {isPhotoReady && (
                            <Box
                                component="img"
                                alt={`${displayName} post`}
                                src={displayImageUrl}
                                sx={{
                                    animation: isRead
                                        ? "none"
                                        : "spaceNewPostImageFade 520ms cubic-bezier(0.16, 1, 0.3, 1) both",
                                    height: "100%",
                                    inset: 0,
                                    objectFit: "cover",
                                    position: "absolute",
                                    width: "100%",
                                    "@keyframes spaceNewPostImageFade": {
                                        from: { opacity: 0 },
                                        to: { opacity: 1 },
                                    },
                                    "@media (prefers-reduced-motion: reduce)": {
                                        animation: "none",
                                    },
                                }}
                            />
                        )}
                    </>
                ) : (
                    <Box
                        aria-hidden
                        sx={{
                            bgcolor: mediaPlaceholderColor,
                            height: "100%",
                            width: "100%",
                        }}
                    />
                )}
                {!isLoading && !post && (
                    <SpacePostBadge
                        backgroundColor="rgba(255, 255, 255, 0.82)"
                        color={textSecondary}
                        placement="center"
                    >
                        {isRequestPending ? "Friend request sent" : "No posts"}
                    </SpacePostBadge>
                )}
                {!isLoading && postUnavailable && (
                    <SpacePostBadge
                        backgroundColor="rgba(255, 255, 255, 0.82)"
                        color={textSecondary}
                    >
                        Unavailable
                    </SpacePostBadge>
                )}
                {!isRead && <SpacePostUnreadBadge count={posts.length} />}
            </Box>
            <Box
                component="button"
                type="button"
                aria-label={
                    isRequestPending
                        ? `Manage friend request sent to ${firstName}`
                        : `Open ${firstName}'s profile`
                }
                disabled={!canOpenFriend}
                onClick={openFriend}
                onContextMenu={(event) => {
                    if (onWave) event.preventDefault();
                }}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                sx={{
                    appearance: "none",
                    bgcolor: "transparent",
                    border: displayAvatarUrl
                        ? "2px solid rgba(255, 255, 255, 0.36)"
                        : "2px solid rgba(255, 255, 255, 0.28)",
                    borderRadius: "50%",
                    bottom: "10%",
                    boxSizing: "border-box",
                    cursor: canOpenFriend ? "pointer" : "default",
                    height: avatarSize,
                    left: "10%",
                    maxHeight: 36,
                    maxWidth: 36,
                    overflow: "hidden",
                    p: 0,
                    position: "absolute",
                    width: avatarSize,
                    zIndex: 2,
                }}
            >
                {isAvatarPending ? (
                    <Skeleton
                        variant="circular"
                        sx={{
                            bgcolor: mediaPlaceholderColor,
                            height: "100%",
                            transform: "none",
                            width: "100%",
                        }}
                    />
                ) : displayAvatarUrl ? (
                    <SpaceAvatarImage aria-hidden src={displayAvatarUrl} />
                ) : (
                    <Box
                        aria-hidden
                        sx={{
                            alignItems: "center",
                            bgcolor: avatarFallbackColor,
                            color: avatarFallbackTextColor,
                            display: "flex",
                            fontSize: 14,
                            fontWeight: 700,
                            height: "100%",
                            justifyContent: "center",
                            width: "100%",
                        }}
                    >
                        {initial}
                    </Box>
                )}
            </Box>
            {waveAnimationID > 0 && (
                <Box
                    key={waveAnimationID}
                    component="span"
                    aria-hidden
                    sx={{
                        "@keyframes spaceHomeWaveSent": {
                            "0%": {
                                opacity: 0,
                                transform:
                                    "translateY(9px) scale(0.65) rotate(0deg)",
                            },
                            "12%": {
                                opacity: 1,
                                transform:
                                    "translateY(0) scale(1.1) rotate(-22deg)",
                            },
                            "32%": {
                                transform:
                                    "translateY(-2px) scale(1.1) rotate(22deg)",
                            },
                            "52%": {
                                transform:
                                    "translateY(-5px) scale(1.08) rotate(-20deg)",
                            },
                            "72%": {
                                opacity: 1,
                                transform:
                                    "translateY(-9px) scale(1.05) rotate(17deg)",
                            },
                            "100%": {
                                opacity: 0,
                                transform:
                                    "translateY(-20px) scale(0.92) rotate(0deg)",
                            },
                        },
                        animation: `spaceHomeWaveSent ${waveAnimationDurationMs}ms ease-out both`,
                        bottom: "8%",
                        fontSize: placement
                            ? Math.max(32, Math.min(54, placement.size * 0.27))
                            : 38,
                        lineHeight: 1,
                        pointerEvents: "none",
                        position: "absolute",
                        right: "8%",
                        transformOrigin: "70% 75%",
                        zIndex: 3,
                        "@media (prefers-reduced-motion: reduce)": {
                            animation: "none",
                        },
                    }}
                >
                    👋
                </Box>
            )}
        </Box>
    );
};

const AddedFriendToast: React.FC<AddedFriendToastProps> = ({
    message,
    onClose,
}) => (
    <SpaceActionToast
        autoDismissAfterMs={spaceToastAutoDismissDurationMs}
        closeLabel="Dismiss friend request status"
        icon={
            <HugeiconsIcon icon={UserAdd02Icon} size={20} strokeWidth={1.8} />
        }
        message={message}
        onClose={onClose}
    />
);

export const HomeScreen: React.FC<HomeScreenProps> = ({
    latestPosts,
    unreadPosts,
    friendRequestSentToastName,
    friends,
    sentFriendRequests,
    hasUnreadMessages,
    isLatestPostsLoading = false,
    isFriendsLoading = false,
    isFriendRequestsLoading = false,
    showInstallPrompt = false,
    onCreatePost,
    onLoadFriendAvatar,
    onLoadPostImage,
    onFriendRequestSentToastClose,
    onOpenFriend,
    onOpenFriendRequests,
    onOpenMessages,
    onOpenProfile,
    onReplyToPost,
    onSetPostLiked,
    onWaveFriend,
    profile,
    profileLink,
    viewerSpaceId,
}) => {
    const [selectedViewer, setSelectedViewer] =
        useState<SelectedHomeViewer | null>(null);
    const [openedPostIds, setOpenedPostIds] = useState<Set<number>>(new Set());
    const [postTileCanvasSize, setPostTileCanvasSize] =
        useState<PostTileCanvasSize>({ height: 0, width: 0 });
    const [isDraftPostExitAnimating, setIsDraftPostExitAnimating] =
        useState(false);
    const [isDraftPostExiting, setIsDraftPostExiting] = useState(false);
    const [isPostPhotoOpening, setIsPostPhotoOpening] = useState(false);
    const [loadedFriendAvatarURLsByKey, setLoadedFriendAvatarURLsByKey] =
        useState<Record<string, string | null>>({});
    const [loadedPostImageURLsByKey, setLoadedPostImageURLsByKey] = useState<
        Record<string, string>
    >({});
    const [unavailablePostsByKey, setUnavailablePostsByKey] = useState<
        Record<string, true>
    >({});
    const postTileCanvasRef = React.useRef<HTMLDivElement | null>(null);
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const localPostObjectUrlsRef = React.useRef<Set<string>>(new Set());
    const activeLocalPostObjectUrlRef = React.useRef<string | null>(null);
    const avatarLoadsInFlightRef = React.useRef<
        Map<string, Promise<string | null>>
    >(new Map());
    const imageLoadsInFlightRef = React.useRef<
        Map<string, Promise<string | undefined>>
    >(new Map());
    const isPostPhotoButtonDisabled =
        isPostPhotoOpening || !viewerSpaceId || !onCreatePost;
    const selectedPhotoFriendID = selectedViewer?.photo.friendID;
    const selectedPhotoIsOwn =
        Boolean(viewerSpaceId) && selectedPhotoFriendID == viewerSpaceId;
    const latestPostByFriendID = React.useMemo(() => {
        const posts = new Map<string, SpacePost>();
        for (const post of latestPosts) {
            posts.set(post.friendID, post);
            posts.set(post.spaceId, post);
        }
        return posts;
    }, [latestPosts]);
    const unreadPostsByFriendID = React.useMemo(() => {
        const postsByFriendID = new Map<string, SpacePost[]>();
        for (const post of unreadPosts) {
            if (openedPostIds.has(post.postId)) continue;
            for (const friendID of new Set([post.friendID, post.spaceId])) {
                const posts = postsByFriendID.get(friendID) ?? [];
                posts.push(post);
                postsByFriendID.set(friendID, posts);
            }
        }
        for (const posts of postsByFriendID.values()) {
            posts.sort(
                (a, b) => b.timestampMs - a.timestampMs || b.postId - a.postId,
            );
        }
        return postsByFriendID;
    }, [openedPostIds, unreadPosts]);
    const orderedHomeItems = React.useMemo(() => {
        const friendIDs = new Set(
            friends.map((friend) => friend.spaceId ?? friend.id),
        );
        return [
            ...friends.map((friend) => ({ friend, type: "friend" as const })),
            ...sentFriendRequests
                .filter(
                    (request) =>
                        !friendIDs.has(
                            request.friend.spaceId ?? request.friend.id,
                        ),
                )
                .map((request) => ({ request, type: "request" as const })),
        ].sort((a, b) => {
            const aFriend = a.type == "friend" ? a.friend : a.request.friend;
            const bFriend = b.type == "friend" ? b.friend : b.request.friend;
            return (aFriend.spaceId ?? aFriend.id).localeCompare(
                bFriend.spaceId ?? bFriend.id,
            );
        });
    }, [friends, sentFriendRequests]);
    React.useEffect(() => setOpenedPostIds(new Set()), [viewerSpaceId]);
    React.useEffect(() => {
        const canvas = postTileCanvasRef.current;
        if (!canvas) return;

        const updateSize = () => {
            const { height, width } = canvas.getBoundingClientRect();
            setPostTileCanvasSize({ height, width });
        };
        const observer = new ResizeObserver(updateSize);
        observer.observe(canvas);
        updateSize();
        return () => observer.disconnect();
    }, []);
    const postTilePlacements = homeTilePlacements(
        orderedHomeItems.length,
        postTileCanvasSize.width,
        postTileCanvasSize.height,
    );
    const usesPostGrid = usesHomeTileGrid(orderedHomeItems.length);
    const postGridLayout = homeTileGridLayout(
        orderedHomeItems.length,
        postTileCanvasSize.width,
        postTileCanvasSize.height,
    );
    const emptyFriendTileSize = Math.min(
        postTileCanvasSize.width,
        Math.max(0, postTileCanvasSize.height - 64),
    );
    const isInstallPromptEnabled =
        showInstallPrompt && !friendRequestSentToastName && !selectedViewer;
    const isHomeItemsLoading = isFriendsLoading || isFriendRequestsLoading;
    const showUnreadIndicator = hasUnreadMessages === true;
    const profileDisplayName =
        profile?.fullName.trim() || profile?.username.trim() || "";
    const revokeLocalPostObjectUrls = React.useCallback(() => {
        localPostObjectUrlsRef.current.forEach((objectUrl) =>
            URL.revokeObjectURL(objectUrl),
        );
        localPostObjectUrlsRef.current.clear();
    }, []);
    const releaseLocalPostObjectUrl = React.useCallback((objectUrl: string) => {
        localPostObjectUrlsRef.current.delete(objectUrl);
        URL.revokeObjectURL(objectUrl);
    }, []);

    const openPostPhotoPicker = () => {
        if (isPostPhotoButtonDisabled) return;

        postInputRef.current?.click();
    };
    const markPostRead = React.useCallback(
        (post: Pick<SpacePost, "postId" | "timestampMs">) => {
            if (!viewerSpaceId) return;
            setOpenedPostIds((current) => new Set(current).add(post.postId));
            void markSpaceHomePostRead(viewerSpaceId, post).catch(
                (error: unknown) =>
                    log.warn("Failed to mark Space post as read", error),
            );
        },
        [viewerSpaceId],
    );
    const openPostPhotos = (
        friend: FriendProfile,
        posts: SpacePost[],
        photo: SpaceViewerPhoto,
    ) => {
        if (photo.postId) {
            markPostRead({
                postId: photo.postId,
                timestampMs: photo.timestampMs,
            });
        }
        const isOwnPost =
            Boolean(viewerSpaceId) && photo.friendID == viewerSpaceId;
        setSelectedViewer({
            avatarUrl: photo.avatarUrl,
            friend,
            photo,
            postIndex: 0,
            postActionMode: isOwnPost ? "hidden" : "like-only",
            posts,
        });
    };
    const closeSelectedPhoto = () => {
        activeLocalPostObjectUrlRef.current = null;
        setIsDraftPostExitAnimating(false);
        setIsDraftPostExiting(false);
        setSelectedViewer(null);
        revokeLocalPostObjectUrls();
    };
    const { clearBrowserBackState: clearSelectedPhotoHistory } =
        useBrowserBackClose({
            open: Boolean(selectedViewer),
            onClose: () => {
                if (!isDraftPostExiting) closeSelectedPhoto();
            },
            stateKey: "space-home-viewer",
        });
    const loadedPostImageURLFor = React.useCallback(
        (item: SpacePost) =>
            item.imageUrl ?? loadedPostImageURLsByKey[postImageCacheKey(item)],
        [loadedPostImageURLsByKey],
    );
    const loadedFriendAvatarURLFor = React.useCallback(
        (friend: FriendProfile) =>
            friend.avatarUrl ??
            loadedFriendAvatarURLsByKey[friendAvatarCacheKey(friend)],
        [loadedFriendAvatarURLsByKey],
    );
    const loadPostImage = React.useCallback(
        (item: SpacePost) => {
            const loadedImageUrl = loadedPostImageURLFor(item);
            if (loadedImageUrl) return Promise.resolve(loadedImageUrl);
            if (!item.imageAsset || !onLoadPostImage) {
                return Promise.resolve(undefined);
            }

            const cacheKey = postImageCacheKey(item);
            if (unavailablePostsByKey[cacheKey]) {
                return Promise.resolve(undefined);
            }
            const inFlight = imageLoadsInFlightRef.current.get(cacheKey);
            if (inFlight) return inFlight;

            const load = onLoadPostImage(item.imageAsset)
                .then((imageUrl) => {
                    setLoadedPostImageURLsByKey((currentURLs) =>
                        currentURLs[cacheKey] == imageUrl
                            ? currentURLs
                            : { ...currentURLs, [cacheKey]: imageUrl },
                    );
                    return imageUrl;
                })
                .catch((error: unknown) => {
                    log.warn("Failed to load latest post image", error);
                    if (isSpaceContentError(error)) {
                        setUnavailablePostsByKey((current) => ({
                            ...current,
                            [cacheKey]: true,
                        }));
                    }
                    return undefined;
                })
                .finally(() => {
                    imageLoadsInFlightRef.current.delete(cacheKey);
                });
            imageLoadsInFlightRef.current.set(cacheKey, load);
            return load;
        },
        [loadedPostImageURLFor, onLoadPostImage, unavailablePostsByKey],
    );
    const loadFriendAvatar = React.useCallback(
        (friend: FriendProfile) => {
            const loadedAvatarUrl = loadedFriendAvatarURLFor(friend);
            if (loadedAvatarUrl !== undefined) {
                return Promise.resolve(loadedAvatarUrl);
            }
            if (!friend.avatarObjectID || !onLoadFriendAvatar) {
                return Promise.resolve(null);
            }

            const cacheKey = friendAvatarCacheKey(friend);
            const inFlight = avatarLoadsInFlightRef.current.get(cacheKey);
            if (inFlight) return inFlight;

            const load = onLoadFriendAvatar(friend)
                .then((avatarUrl) => {
                    setLoadedFriendAvatarURLsByKey((currentURLs) =>
                        currentURLs[cacheKey] == avatarUrl
                            ? currentURLs
                            : { ...currentURLs, [cacheKey]: avatarUrl },
                    );
                    return avatarUrl;
                })
                .catch((error: unknown) => {
                    log.warn("Failed to load friend avatar", error);
                    setLoadedFriendAvatarURLsByKey((currentURLs) =>
                        currentURLs[cacheKey] === null
                            ? currentURLs
                            : { ...currentURLs, [cacheKey]: null },
                    );
                    return null;
                })
                .finally(() => {
                    avatarLoadsInFlightRef.current.delete(cacheKey);
                });
            avatarLoadsInFlightRef.current.set(cacheKey, load);
            return load;
        },
        [loadedFriendAvatarURLFor, onLoadFriendAvatar],
    );
    const selectedViewerPostIndex = selectedViewer?.postIndex;
    const selectedViewerPosts = selectedViewer?.posts;
    const selectedViewerPhotos = React.useMemo(() => {
        const friend = selectedViewer?.friend;
        if (!selectedViewerPosts || !friend) return undefined;

        return selectedViewerPosts.map((post) =>
            viewerPhotoForPost(
                post,
                friend,
                selectedViewer.avatarUrl,
                loadedPostImageURLFor(post) ??
                    (selectedViewer.photo.postId == post.postId
                        ? selectedViewer.photo.imageUrl
                        : ""),
            ),
        );
    }, [loadedPostImageURLFor, selectedViewer, selectedViewerPosts]);
    const handleSelectedViewerPostIndexChange = React.useCallback(
        (postIndex: number) => {
            const currentViewer = selectedViewer;
            const post = currentViewer?.posts?.[postIndex];
            const friend = currentViewer?.friend;
            if (!post || !friend) return;

            markPostRead(post);
            const updateSelectedViewer = (
                imageUrl: string,
                requireActivePost = false,
            ) => {
                setSelectedViewer((viewer) => {
                    if (
                        !viewer?.posts ||
                        viewer.posts !== currentViewer.posts ||
                        (requireActivePost &&
                            (viewer.postIndex != postIndex ||
                                viewer.photo.postId != post.postId))
                    ) {
                        return viewer;
                    }
                    return {
                        ...viewer,
                        photo: viewerPhotoForPost(
                            post,
                            friend,
                            viewer.avatarUrl,
                            imageUrl,
                        ),
                        postIndex,
                    };
                });
            };

            const imageUrl = loadedPostImageURLFor(post);
            if (imageUrl) {
                updateSelectedViewer(imageUrl);
                return;
            }

            updateSelectedViewer("");
            void loadPostImage(post).then((loadedImageUrl) => {
                if (loadedImageUrl) {
                    updateSelectedViewer(loadedImageUrl, true);
                }
            });
        },
        [loadPostImage, loadedPostImageURLFor, markPostRead, selectedViewer],
    );
    const setSelectedViewerPostLiked = React.useCallback(
        async (postId: number, liked: boolean) => {
            await onSetPostLiked?.(postId, liked);
            setSelectedViewer((viewer) =>
                viewer
                    ? {
                          ...viewer,
                          photo:
                              viewer.photo.postId == postId
                                  ? { ...viewer.photo, viewerLiked: liked }
                                  : viewer.photo,
                          posts: viewer.posts?.map((post) =>
                              post.postId == postId
                                  ? { ...post, viewerLiked: liked }
                                  : post,
                          ),
                      }
                    : viewer,
            );
        },
        [onSetPostLiked],
    );

    React.useEffect(() => {
        if (!selectedViewerPosts || selectedViewerPostIndex == undefined)
            return;

        for (const offset of [-1, 1]) {
            const adjacentPost =
                selectedViewerPosts[selectedViewerPostIndex + offset];
            if (!adjacentPost || loadedPostImageURLFor(adjacentPost)) continue;
            void loadPostImage(adjacentPost);
        }
    }, [
        loadPostImage,
        loadedPostImageURLFor,
        selectedViewerPostIndex,
        selectedViewerPosts,
    ]);
    const friendPostTileFor = (friend: FriendProfile, index: number) => {
        const placement = usesPostGrid ? undefined : postTilePlacements[index];
        const friendID = friend.spaceId ?? friend.id;
        const unreadFriendPosts = (
            unreadPostsByFriendID.get(friendID) ?? []
        ).filter(
            (post) =>
                !post.isUnavailable &&
                !unavailablePostsByKey[postImageCacheKey(post)],
        );
        const latestPost = latestPostByFriendID.get(friendID);
        const posts =
            unreadFriendPosts.length > 0
                ? unreadFriendPosts
                : latestPost
                  ? [latestPost]
                  : [];
        const item = posts[0];
        const imageUrl = item ? loadedPostImageURLFor(item) : undefined;
        const avatarUrl = loadedFriendAvatarURLFor(friend);
        const isAvatarPending = Boolean(
            friend.avatarObjectID && avatarUrl === undefined,
        );
        const isUnavailable = Boolean(
            item &&
            (item.isUnavailable ||
                unavailablePostsByKey[postImageCacheKey(item)]),
        );
        const isRead = unreadFriendPosts.length == 0;
        return (
            <FriendPostTile
                key={`${friend.id}:${item?.postId ?? "empty"}`}
                avatarUrl={avatarUrl}
                friend={friend}
                imageUrl={imageUrl}
                isAvatarPending={isAvatarPending}
                isLoading={isFriendsLoading || isLatestPostsLoading}
                isRead={isRead}
                isUnavailable={isUnavailable}
                onLoadAvatar={() => loadFriendAvatar(friend)}
                onLoadImage={
                    item && !imageUrl && !isUnavailable
                        ? () => loadPostImage(item)
                        : undefined
                }
                onOpenFriend={onOpenFriend}
                onOpenPosts={openPostPhotos}
                onWave={onWaveFriend ? () => onWaveFriend(friend) : undefined}
                placement={placement}
                posts={posts}
            />
        );
    };
    const friendRequestTileFor = (
        request: SpaceFriendRequest,
        index: number,
    ) => {
        const friend = request.friend;
        const avatarUrl = loadedFriendAvatarURLFor(friend);
        return (
            <FriendPostTile
                key={`request:${request.requestId}`}
                avatarUrl={avatarUrl}
                friend={friend}
                isAvatarPending={Boolean(
                    friend.avatarObjectID && avatarUrl === undefined,
                )}
                isLoading={isHomeItemsLoading}
                isRead
                isRequestPending
                isUnavailable={false}
                onLoadAvatar={() => loadFriendAvatar(friend)}
                onOpenFriendRequest={onOpenFriendRequests}
                onOpenPosts={openPostPhotos}
                placement={usesPostGrid ? undefined : postTilePlacements[index]}
                posts={[]}
            />
        );
    };

    const prepareSelectedPostPhoto = React.useCallback(
        async (file: File) => {
            if (!profile) return;

            const canShowLocalPreview = canPreviewSpaceImageFile(file);
            if (!canShowLocalPreview) {
                const timestampMs = Date.now();
                const draftKey = `pending-preview-${timestampMs}`;
                activeLocalPostObjectUrlRef.current = draftKey;
                setSelectedViewer({
                    draftFile: file,
                    isDraftImagePreviewPending: true,
                    localObjectUrl: draftKey,
                    photo: {
                        alt: `${profileDisplayName || "You"} post`,
                        avatarUrl: profile.avatarUrl,
                        imageUrl: "",
                        name: profileDisplayName || "You",
                        timestampMs,
                    },
                    postActionMode: "draft-post",
                });

                window.setTimeout(() => {
                    if (activeLocalPostObjectUrlRef.current != draftKey) return;

                    void spacePostPreviewImageForFile(file)
                        .then((preview) => {
                            if (
                                activeLocalPostObjectUrlRef.current != draftKey
                            ) {
                                URL.revokeObjectURL(preview.url);
                                return;
                            }

                            localPostObjectUrlsRef.current.add(preview.url);
                            activeLocalPostObjectUrlRef.current = preview.url;
                            setSelectedViewer((currentViewer) => {
                                if (currentViewer?.localObjectUrl != draftKey)
                                    return currentViewer;

                                return {
                                    ...currentViewer,
                                    isDraftImagePreviewPending: false,
                                    localObjectUrl: preview.url,
                                    photo: {
                                        ...currentViewer.photo,
                                        height: preview.height,
                                        imageUrl: preview.url,
                                        width: preview.width,
                                    },
                                };
                            });
                        })
                        .catch((error: unknown) => {
                            log.error("Failed to prepare post preview", error);
                            const message = spacePostImageErrorMessage(error);
                            setSelectedViewer((currentViewer) => {
                                if (currentViewer?.localObjectUrl != draftKey)
                                    return currentViewer;

                                return {
                                    ...currentViewer,
                                    draftImageError: message,
                                };
                            });
                        });
                }, 0);
                return;
            }

            const localPost = await createLoadedLocalPostPhoto({
                avatarUrl: profile.avatarUrl,
                file,
                name: profileDisplayName || "You",
            });
            localPostObjectUrlsRef.current.add(localPost.objectUrl);
            activeLocalPostObjectUrlRef.current = localPost.objectUrl;
            setSelectedViewer({
                draftFile: file,
                localObjectUrl: localPost.objectUrl,
                photo: localPost.photo,
                postActionMode: "draft-post",
            });
        },
        [profile, profileDisplayName],
    );

    const handlePostPhotoSelect: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsPostPhotoOpening(true);
        void prepareSelectedPostPhoto(file)
            .catch((error: unknown) => {
                log.error("Failed to open post photo draft", error);
            })
            .finally(() => {
                setIsPostPhotoOpening(false);
            });
    };

    React.useEffect(
        () => () => {
            activeLocalPostObjectUrlRef.current = null;
            revokeLocalPostObjectUrls();
        },
        [revokeLocalPostObjectUrls],
    );

    return (
        <Box
            component="main"
            sx={{
                background: spaceAppBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
                position: "relative",
            }}
        >
            {selectedViewer && (
                <SpaceViewerPostBackdrop exiting={isDraftPostExitAnimating} />
            )}
            <Box
                sx={{
                    bgcolor: "transparent",
                    boxSizing: "border-box",
                    maxWidth: "100%",
                    minHeight: "100svh",
                    minWidth: 0,
                    mx: "auto",
                    overflowX: "hidden",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <SpaceHomeHeader
                    profile={profile}
                    showUnreadIndicator={showUnreadIndicator}
                    onOpenMessages={onOpenMessages}
                    onOpenProfile={onOpenProfile}
                >
                    <Box
                        ref={postInputRef}
                        component="input"
                        type="file"
                        accept={spacePostImageInputAccept}
                        onChange={handlePostPhotoSelect}
                        sx={{ display: "none" }}
                    />
                </SpaceHomeHeader>
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        height: `calc(100svh - ${spaceHomeHeaderHeight}px)`,
                        minWidth: 0,
                        pb: "calc(env(safe-area-inset-bottom) + 112px)",
                        px: homeHorizontalPadding,
                        pt: `calc(env(safe-area-inset-bottom) + 112px - ${spaceHomeHeaderHeight}px)`,
                        width: "100%",
                    }}
                >
                    <Box
                        ref={postTileCanvasRef}
                        sx={{
                            flex: "1 1 auto",
                            minHeight: 0,
                            position: "relative",
                            width: "100%",
                        }}
                    >
                        {isHomeItemsLoading && orderedHomeItems.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    display: "flex",
                                    height: "100%",
                                    justifyContent: "center",
                                    width: "100%",
                                }}
                            >
                                <SpaceLoadingSpinner ariaLabel="Loading friends and requests" />
                            </Box>
                        ) : orderedHomeItems.length > 0 ? (
                            <Box
                                component="ul"
                                aria-label="Friends and sent friend requests"
                                sx={{
                                    display: usesPostGrid ? "grid" : "block",
                                    gap: postGridLayout
                                        ? `${postGridLayout.gap}px`
                                        : undefined,
                                    gridTemplateColumns: postGridLayout
                                        ? `repeat(3, ${postGridLayout.size}px)`
                                        : undefined,
                                    gridTemplateRows: postGridLayout
                                        ? `repeat(${postGridLayout.rows}, ${postGridLayout.size}px)`
                                        : undefined,
                                    height: "100%",
                                    m: 0,
                                    minHeight: 0,
                                    p: 0,
                                    placeContent: usesPostGrid
                                        ? "center"
                                        : undefined,
                                    position: "relative",
                                    width: "100%",
                                }}
                            >
                                {((usesPostGrid && postGridLayout) ||
                                    (!usesPostGrid &&
                                        postTilePlacements.length ==
                                            orderedHomeItems.length)) &&
                                    orderedHomeItems.map((item, index) =>
                                        item.type == "friend"
                                            ? friendPostTileFor(
                                                  item.friend,
                                                  index,
                                              )
                                            : friendRequestTileFor(
                                                  item.request,
                                                  index,
                                              ),
                                    )}
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    display: "flex",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    height: "100%",
                                    justifyContent: "center",
                                    width: "100%",
                                }}
                            >
                                {emptyFriendTileSize > 0 && (
                                    <Box
                                        className="green-bg"
                                        sx={{
                                            alignItems: "flex-start",
                                            bgcolor: green,
                                            border: 0,
                                            borderRadius: "24px",
                                            boxSizing: "border-box",
                                            color: "#FFF",
                                            display: "flex",
                                            flex: "0 0 auto",
                                            flexDirection: "column",
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            gap: "7px",
                                            height: "100%",
                                            justifyContent: "flex-start",
                                            overflow: "hidden",
                                            px: "24px",
                                            pt: "32px",
                                            position: "relative",
                                            width: "100%",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                alignItems: "center",
                                                display: "flex",
                                                flexDirection: "column",
                                                mt: "64px",
                                                position: "relative",
                                                width: "100%",
                                                zIndex: 1,
                                                "@media (max-height: 720px)": {
                                                    mt: "24px",
                                                },
                                            }}
                                        >
                                            <Box
                                                component="h1"
                                                sx={{
                                                    color: "#FFF",
                                                    fontFamily:
                                                        '"Nunito", "Inter Variable", sans-serif',
                                                    fontSize: 25,
                                                    fontWeight: 800,
                                                    lineHeight: "30px",
                                                    m: 0,
                                                    maxWidth: 260,
                                                    textAlign: "center",
                                                }}
                                            >
                                                Invite your close friends and
                                                family
                                            </Box>
                                            <Box
                                                component="p"
                                                sx={{
                                                    color: "rgba(255, 255, 255, 0.84)",
                                                    fontSize: 15,
                                                    fontWeight: 500,
                                                    lineHeight: "21px",
                                                    m: 0,
                                                    mt: "10px",
                                                    maxWidth: 260,
                                                    textAlign: "center",
                                                }}
                                            >
                                                Each person gets a little spot
                                                of their own in your Space.
                                            </Box>
                                            <Box sx={{ mt: "24px" }}>
                                                <SpaceShareInviteButton
                                                    profileLink={profileLink}
                                                    variant="white"
                                                    onShareError={(error) =>
                                                        log.error(
                                                            "Failed to share Space invite link",
                                                            error,
                                                        )
                                                    }
                                                />
                                            </Box>
                                        </Box>
                                        <Box
                                            component="img"
                                            alt=""
                                            aria-hidden
                                            src="/images/ducky-space.svg"
                                            sx={{
                                                bottom: 0,
                                                height: "auto",
                                                left: "52%",
                                                maxWidth: 300,
                                                pointerEvents: "none",
                                                position: "absolute",
                                                transform:
                                                    "translate(-50%, 4%)",
                                                width: "84%",
                                                "@media (max-height: 720px)": {
                                                    maxWidth: 228,
                                                    width: "64%",
                                                },
                                            }}
                                        />
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>
                </Box>
                <SpacePostFloatingActionButton
                    disabled={isPostPhotoButtonDisabled}
                    onClick={openPostPhotoPicker}
                />
                {selectedViewer && (
                    <SpaceFileViewer
                        focusReplyOnOpen={selectedViewer.focusReplyOnOpen}
                        photo={selectedViewer.photo}
                        photos={selectedViewerPhotos}
                        photoIndex={selectedViewerPostIndex}
                        draftPostPreparationError={
                            selectedViewer.draftImageError
                        }
                        isDraftPostPreviewPending={
                            selectedViewer.isDraftImagePreviewPending
                        }
                        postActionMode={selectedViewer.postActionMode}
                        showSequenceProgress={Boolean(
                            selectedViewerPosts &&
                            selectedViewerPosts.length > 1,
                        )}
                        onPhotoIndexChange={
                            selectedViewerPosts
                                ? handleSelectedViewerPostIndexChange
                                : undefined
                        }
                        onClose={closeSelectedPhoto}
                        onOpenProfile={
                            selectedPhotoIsOwn && onOpenProfile
                                ? () => {
                                      void clearSelectedPhotoHistory(
                                          "back",
                                      ).finally(() => {
                                          closeSelectedPhoto();
                                          onOpenProfile();
                                      });
                                  }
                                : selectedPhotoFriendID && onOpenFriend
                                  ? () => {
                                        void clearSelectedPhotoHistory(
                                            "back",
                                        ).finally(() => {
                                            closeSelectedPhoto();
                                            onOpenFriend(
                                                selectedPhotoFriendID,
                                                selectedViewer.photo.username,
                                            );
                                        });
                                    }
                                  : undefined
                        }
                        onSwipeLeft={
                            !selectedViewerPosts ||
                            selectedViewerPostIndex ==
                                selectedViewerPosts.length - 1
                                ? closeSelectedPhoto
                                : undefined
                        }
                        onReplyToPost={
                            !selectedPhotoIsOwn &&
                            selectedViewer.photo.friendID != viewerSpaceId
                                ? onReplyToPost
                                : undefined
                        }
                        onPublishDraftPost={
                            selectedViewer.draftFile && onCreatePost
                                ? (caption, edit) => {
                                      const previewUrl =
                                          selectedViewer.photo.imageUrl;
                                      const publishPromise = onCreatePost(
                                          {
                                              cropArea: edit.cropArea,
                                              file: selectedViewer.draftFile!,
                                              height: edit.height,
                                              rotationDegrees:
                                                  edit.rotationDegrees,
                                              width: edit.width,
                                          },
                                          caption,
                                      );
                                      return publishPromise.finally(() =>
                                          releaseLocalPostObjectUrl(previewUrl),
                                      );
                                  }
                                : undefined
                        }
                        onDraftPostExitAnimationStart={() => {
                            setIsDraftPostExitAnimating(true);
                        }}
                        onDraftPostExitStart={() => {
                            setIsDraftPostExiting(true);
                        }}
                        onSetPostLiked={
                            onSetPostLiked
                                ? setSelectedViewerPostLiked
                                : undefined
                        }
                    />
                )}
                {friendRequestSentToastName ? (
                    <AddedFriendToast
                        message={`Friend request sent to @${friendRequestSentToastName}`}
                        onClose={onFriendRequestSentToastClose}
                    />
                ) : (
                    <SpacePWAInstallPrompt enabled={isInstallPromptEnabled} />
                )}
            </Box>
        </Box>
    );
};
