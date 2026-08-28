import {
    BubbleChatIcon,
    MultiplicationSignIcon,
    UserAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import { SpaceAvatarImage } from "components/AvatarImage";
import {
    SpaceFileViewer,
    SpaceViewerFeedBackdrop,
    type SpaceViewerDraftPostEdit,
    type SpaceViewerPhoto,
    type SpaceViewerPostActionMode,
} from "components/FileViewer";
import { SpacePostFloatingActionButton } from "components/PostFloatingActionButton";
import { SpacePWAInstallPrompt } from "components/PWAInstallPrompt";
import { SpaceLoadingSpinner } from "components/RouteFallback";
import type { FriendProfile } from "data/friends";
import log from "ente-base/log";
import { useBrowserBackClose } from "hooks/use-browser-back-close";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    isSpaceContentError,
    type SpacePost,
    type SpacePostAssetURLLoader,
} from "services/space";
import { spaceTouchTargetSize } from "styles/touch-targets";
import { firstNameFrom } from "utils/display";
import {
    homeCircleOrbitGap,
    homeCirclePlacements,
    type HomeCirclePlacement,
} from "utils/home-circle-layout";
import { createLoadedLocalPostPhoto } from "utils/local-post-photo";
import {
    canPreviewSpaceImageFile,
    spacePostImageErrorMessage,
    spacePostImageInputAccept,
    spacePostPreviewImageForFile,
} from "utils/post-image";

export const homeBackground = "#0C1014";

const green = "#08C225";
const mediaSkeletonElementBackground = "#E6E6E6";
const textBase = "#000";
const textSecondary = "#6B6B6B";
const dangerColor = "#F63A3A";
const headerActionSize = spaceTouchTargetSize;
const headerAvatarSize = 36;
const headerAvatarImageSize = 26;
const headerChatCircleSize = 36;
const headerChromeColor = "#202825";
const headerHeight = 64;
const headerIconSize = 22;
const headerSideWidth = 36;
const homeHorizontalPadding = "16px";
const postCircleMediaLoadRootMargin = "640px 0px";
const waveAnimationDurationMs = 900;
const waveHoldDurationMs = 500;
const waveHoldMovementTolerancePx = 12;
const avatarFadeSx = {
    "@keyframes spaceAvatarFade": { from: { opacity: 0 }, to: { opacity: 1 } },
    animation: "spaceAvatarFade 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;
interface HomeScreenProps {
    unseenPosts: SpacePost[];
    friendRequestSentToastName?: string;
    friends: FriendProfile[];
    hasUnreadMessages?: boolean;
    initialPostPhotoFile?: File | null;
    isLatestPostsLoading?: boolean;
    isFriendsLoading?: boolean;
    showInstallPrompt?: boolean;
    onCreatePost?: (
        image: DraftSpacePostImage,
        caption: string,
    ) => Promise<void>;
    onLoadFriendAvatar?: (friend: FriendProfile) => Promise<string | null>;
    onLoadPostImage?: SpacePostAssetURLLoader;
    onFriendRequestSentToastClose?: () => void;
    onInitialPostPhotoConsumed?: () => void;
    onOpenFriend?: (friendID: string, username?: string) => void;
    onOpenMessages?: () => void;
    onOpenProfile?: () => void;
    onPostSeen?: (friendSpaceID: string, postID: number) => void;
    onReplyToPost?: (
        postSpaceId: string,
        postId: number,
        text: string,
    ) => Promise<void>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    onWaveFriend?: (friend: FriendProfile) => Promise<void>;
    profile: SetupProfile | null;
    viewerSpaceId?: string;
}

interface DecodedImageState {
    failed?: boolean;
    height?: number;
    ready: boolean;
    src?: string | null;
    width?: number;
}

interface PostCircleCanvasSize {
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

interface DraftSpacePostImage {
    cropArea?: SpaceViewerDraftPostEdit["cropArea"];
    file: File;
    height?: number;
    rotationDegrees?: number;
    width?: number;
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

const orbitPhaseFor = (value: string) => {
    let hash = 0;
    for (const character of value) {
        hash = (hash * 31 + character.charCodeAt(0)) % 360;
    }
    return hash;
};

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

interface FriendPostCircleProps {
    avatarUrl?: string | null;
    friend: FriendProfile;
    imageUrl?: string;
    isAvatarPending: boolean;
    isLoading: boolean;
    isUnavailable: boolean;
    onLoadAvatar?: () => Promise<string | null | undefined>;
    onLoadImage?: () => Promise<string | undefined>;
    onOpenFriend?: (friendID: string, username?: string) => void;
    onOpenPosts: (
        friend: FriendProfile,
        posts: SpacePost[],
        photo: SpaceViewerPhoto,
    ) => void;
    onPostUnavailable?: (friendSpaceID: string, postID: number) => void;
    onWave?: () => Promise<void>;
    placement: HomeCirclePlacement;
    posts: SpacePost[];
}

const FriendPostCircle: React.FC<FriendPostCircleProps> = ({
    avatarUrl,
    friend,
    imageUrl,
    isAvatarPending,
    isLoading,
    isUnavailable,
    onLoadAvatar,
    onLoadImage,
    onOpenFriend,
    onOpenPosts,
    onPostUnavailable,
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
    const displayName = friend.fullName.trim() || friend.username.trim();
    const firstName = firstNameFrom(displayName);
    const post = posts[0];
    const postUnavailable = isUnavailable || decodedPhoto.failed;
    const hasNewPost = posts.length > 0 && !postUnavailable;
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
    const isCircleDisabled =
        isLoading || Boolean(post && !postUnavailable && !isPhotoReady);
    const orbitDotSize = Math.max(8, Math.min(12, placement.size * 0.05));
    const orbitDurationSeconds = Math.max(
        30,
        Math.min(42, placement.size * 0.13),
    );
    const orbitGap = homeCircleOrbitGap(placement.size);
    const orbitAnimationDelaySeconds =
        -(orbitPhaseFor(friend.spaceId ?? friend.id) / 360) *
        orbitDurationSeconds;

    React.useEffect(() => {
        if (isLoading || !post || postUnavailable || shouldLoadMedia) return;
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
            { rootMargin: postCircleMediaLoadRootMargin },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [isLoading, post, postUnavailable, shouldLoadMedia]);

    React.useEffect(() => {
        if (isAvatarPending) void onLoadAvatar?.();
    }, [isAvatarPending, onLoadAvatar]);

    React.useEffect(() => {
        if (!shouldLoadMedia || postUnavailable) return;
        if (!imageUrl) void onLoadImage?.();
    }, [imageUrl, onLoadImage, postUnavailable, shouldLoadMedia]);

    React.useEffect(() => {
        if (decodedPhoto.failed && post) {
            onPostUnavailable?.(post.spaceId, post.postId);
        }
    }, [decodedPhoto.failed, onPostUnavailable, post]);

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
        if (
            hasNewPost ||
            isWaveSending ||
            !onWave ||
            !event.isPrimary ||
            event.button != 0
        ) {
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

    const openCircle = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
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

    return (
        <Box
            ref={rootRef}
            component="li"
            sx={{
                aspectRatio: "1",
                left: placement.x,
                listStyle: "none",
                minWidth: 0,
                position: "absolute",
                top: placement.y,
                transition:
                    "left 420ms cubic-bezier(0.2, 0.8, 0.2, 1), top 420ms cubic-bezier(0.2, 0.8, 0.2, 1), width 420ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                width: placement.size,
                "@media (prefers-reduced-motion: reduce)": {
                    transition: "none",
                },
            }}
        >
            <Box
                sx={{
                    aspectRatio: "1",
                    height: "100%",
                    position: "relative",
                    width: "100%",
                    zIndex: 1,
                }}
            >
                {hasNewPost && (
                    <Box
                        aria-hidden
                        sx={{
                            "@keyframes spaceUnreadPostOrbit": {
                                from: { transform: "rotate(0deg)" },
                                to: { transform: "rotate(360deg)" },
                            },
                            animation: `spaceUnreadPostOrbit ${orbitDurationSeconds}s linear infinite`,
                            animationDelay: `${orbitAnimationDelaySeconds}s`,
                            border: "1px solid rgba(159, 181, 164, 0.3)",
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            inset: `-${orbitGap}px`,
                            pointerEvents: "none",
                            position: "absolute",
                            zIndex: 3,
                            "@media (prefers-reduced-motion: reduce)": {
                                animation: "none",
                                transform: `rotate(${orbitPhaseFor(friend.spaceId ?? friend.id)}deg)`,
                            },
                        }}
                    >
                        {posts.map((item, index) => {
                            const angle =
                                -Math.PI / 2 +
                                (index * Math.PI * 2) / posts.length;
                            return (
                                <Box
                                    key={item.postId}
                                    component="span"
                                    sx={{
                                        bgcolor: green,
                                        borderRadius: "50%",
                                        boxShadow:
                                            "0 2px 6px rgba(0, 0, 0, 0.5), 0 0 10px rgba(8, 194, 37, 0.8)",
                                        height: orbitDotSize,
                                        left: `${50 + Math.cos(angle) * 50}%`,
                                        position: "absolute",
                                        top: `${50 + Math.sin(angle) * 50}%`,
                                        transform: "translate(-50%, -50%)",
                                        width: orbitDotSize,
                                    }}
                                />
                            );
                        })}
                    </Box>
                )}
                <Box
                    component="button"
                    type="button"
                    aria-label={
                        isLoading
                            ? `Loading ${firstName}`
                            : post && !postUnavailable
                              ? `View ${posts.length} new ${posts.length == 1 ? "post" : "posts"} from ${firstName}`
                              : `View ${firstName}'s profile`
                    }
                    disabled={isCircleDisabled}
                    onClick={openCircle}
                    onContextMenu={(event) => {
                        if (!hasNewPost) event.preventDefault();
                    }}
                    onPointerCancel={handlePointerEnd}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        aspectRatio: "1",
                        bgcolor: "#E5E7EA",
                        border: 0,
                        borderRadius: "50%",
                        boxShadow: isHoldingWave
                            ? "0 1px 3px rgba(0, 0, 0, 0.22), 0 4px 10px rgba(0, 0, 0, 0.14)"
                            : "0 3px 8px rgba(0, 0, 0, 0.2), 0 12px 24px rgba(0, 0, 0, 0.14)",
                        color: textBase,
                        cursor: isCircleDisabled ? "default" : "pointer",
                        display: "flex",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        height: "100%",
                        justifyContent: "center",
                        overflow: "hidden",
                        p: 0,
                        position: "relative",
                        transform: isHoldingWave ? "scale(0.98)" : "scale(1)",
                        transition:
                            "box-shadow 160ms ease-out, transform 160ms ease-out",
                        userSelect: "none",
                        WebkitTouchCallout: "none",
                        width: "100%",
                        "@media (prefers-reduced-motion: reduce)": {
                            transform: "none",
                            transition: "box-shadow 160ms ease-out",
                        },
                    }}
                >
                    {isLoading || isAvatarPending ? (
                        <Skeleton
                            variant="circular"
                            sx={{
                                bgcolor: mediaSkeletonElementBackground,
                                height: "100%",
                                transform: "none",
                                width: "100%",
                            }}
                        />
                    ) : (
                        <SpaceAvatarImage
                            alt={`${displayName} profile photo`}
                            src={displayAvatarUrl}
                        />
                    )}
                </Box>
                {waveAnimationID > 0 && (
                    <Box
                        key={waveAnimationID}
                        component="span"
                        aria-hidden
                        sx={{
                            "@keyframes spaceWaveSent": {
                                "0%": {
                                    opacity: 0,
                                    transform:
                                        "translateY(8px) scale(0.7) rotate(0deg)",
                                },
                                "15%": {
                                    opacity: 1,
                                    transform:
                                        "translateY(0) scale(1) rotate(-18deg)",
                                },
                                "35%": {
                                    opacity: 1,
                                    transform:
                                        "translateY(-1px) scale(1) rotate(16deg)",
                                },
                                "55%": {
                                    opacity: 1,
                                    transform:
                                        "translateY(-3px) scale(1) rotate(-14deg)",
                                },
                                "75%": {
                                    opacity: 1,
                                    transform:
                                        "translateY(-6px) scale(1) rotate(12deg)",
                                },
                                "100%": {
                                    opacity: 0,
                                    transform:
                                        "translateY(-12px) scale(0.95) rotate(0deg)",
                                },
                            },
                            "@keyframes spaceWaveSentReduced": {
                                "0%, 80%": { opacity: 1 },
                                "100%": { opacity: 0 },
                            },
                            animation: `spaceWaveSent ${waveAnimationDurationMs}ms ease-out both`,
                            fontSize: Math.max(
                                28,
                                Math.min(48, placement.size * 0.23),
                            ),
                            lineHeight: 1,
                            bottom: "8%",
                            pointerEvents: "none",
                            position: "absolute",
                            right: "8%",
                            transformOrigin: "70% 75%",
                            zIndex: 2,
                            "@media (prefers-reduced-motion: reduce)": {
                                animation: `spaceWaveSentReduced ${waveAnimationDurationMs}ms ease-out both`,
                            },
                        }}
                    >
                        👋
                    </Box>
                )}
            </Box>
        </Box>
    );
};

const AddedFriendToast: React.FC<AddedFriendToastProps> = ({
    message,
    onClose,
}) => (
    <Box
        sx={{
            boxSizing: "border-box",
            left: "50%",
            px: homeHorizontalPadding,
            pointerEvents: "none",
            position: "fixed",
            top: "calc(env(safe-area-inset-top) + 10px)",
            transform: "translateX(-50%)",
            width: "100%",
            zIndex: 20,
            "@media (min-width: 600px)": { maxWidth: 390 },
        }}
    >
        <Box
            role="status"
            aria-live="polite"
            sx={{
                alignItems: "center",
                bgcolor: "#FFFFFF",
                borderRadius: "18px",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
                boxSizing: "border-box",
                color: textBase,
                display: "flex",
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 14,
                fontWeight: 650,
                gap: "10px",
                lineHeight: "20px",
                minHeight: 50,
                pointerEvents: "auto",
                pl: "16px",
                pr: "6px",
                py: "3px",
                width: "100%",
            }}
        >
            <Box component="span" sx={{ display: "flex", flexShrink: 0 }}>
                <HugeiconsIcon
                    icon={UserAdd02Icon}
                    size={20}
                    strokeWidth={1.8}
                />
            </Box>
            <Box
                component="span"
                sx={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {message}
            </Box>
            <Box
                component="button"
                type="button"
                aria-label="Close"
                onClick={onClose}
                sx={{
                    alignItems: "center",
                    appearance: "none",
                    bgcolor: "transparent",
                    border: 0,
                    color: textBase,
                    cursor: onClose ? "pointer" : "default",
                    display: "flex",
                    flexShrink: 0,
                    height: spaceTouchTargetSize,
                    justifyContent: "center",
                    opacity: 0.9,
                    p: 0,
                    width: spaceTouchTargetSize,
                    "&:focus-visible": {
                        outline: "2px solid rgba(0 0 0 / 0.72)",
                        outlineOffset: 2,
                    },
                }}
            >
                <HugeiconsIcon
                    icon={MultiplicationSignIcon}
                    size={16}
                    strokeWidth={2}
                />
            </Box>
        </Box>
    </Box>
);

export const HomeScreen: React.FC<HomeScreenProps> = ({
    unseenPosts,
    friendRequestSentToastName,
    friends,
    hasUnreadMessages,
    initialPostPhotoFile,
    isLatestPostsLoading = false,
    isFriendsLoading = false,
    showInstallPrompt = false,
    onCreatePost,
    onLoadFriendAvatar,
    onLoadPostImage,
    onFriendRequestSentToastClose,
    onInitialPostPhotoConsumed,
    onOpenFriend,
    onOpenMessages,
    onOpenProfile,
    onPostSeen,
    onReplyToPost,
    onSetPostLiked,
    onWaveFriend,
    profile,
    viewerSpaceId,
}) => {
    const [selectedViewer, setSelectedViewer] =
        useState<SelectedHomeViewer | null>(null);
    const [postCircleCanvasSize, setPostCircleCanvasSize] =
        useState<PostCircleCanvasSize>({ height: 0, width: 0 });
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
    const postCircleCanvasRef = React.useRef<HTMLDivElement | null>(null);
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const initialPostPhotoFileRef = React.useRef<File | null>(null);
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
    const unseenPostsByFriendID = React.useMemo(() => {
        const postsByFriendID = new Map<string, SpacePost[]>();
        for (const post of unseenPosts) {
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
    }, [unseenPosts]);
    const orderedFriends = React.useMemo(
        () =>
            [...friends].sort((a, b) =>
                (a.spaceId ?? a.id).localeCompare(b.spaceId ?? b.id),
            ),
        [friends],
    );
    React.useEffect(() => {
        const canvas = postCircleCanvasRef.current;
        if (!canvas) return;

        const updateSize = () => {
            const { height, width } = canvas.getBoundingClientRect();
            setPostCircleCanvasSize({ height, width });
        };
        const observer = new ResizeObserver(updateSize);
        observer.observe(canvas);
        updateSize();
        return () => observer.disconnect();
    }, []);
    const postCirclePlacements = homeCirclePlacements(
        orderedFriends.length,
        postCircleCanvasSize.width,
        postCircleCanvasSize.height,
    );
    const isInstallPromptEnabled =
        showInstallPrompt && !friendRequestSentToastName && !selectedViewer;
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
    const openPostPhotos = (
        friend: FriendProfile,
        posts: SpacePost[],
        photo: SpaceViewerPhoto,
    ) => {
        const isOwnPost =
            Boolean(viewerSpaceId) && photo.friendID == viewerSpaceId;
        if (!isOwnPost && photo.spaceId && photo.postId) {
            onPostSeen?.(photo.spaceId, photo.postId);
        }
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
        (friend: FriendProfile) => {
            if (friend.avatarUrl) return friend.avatarUrl;
            if (!friend.avatarObjectID) return null;
            return loadedFriendAvatarURLsByKey[friendAvatarCacheKey(friend)];
        },
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
                        onPostSeen?.(item.spaceId, item.postId);
                    }
                    return undefined;
                })
                .finally(() => {
                    imageLoadsInFlightRef.current.delete(cacheKey);
                });
            imageLoadsInFlightRef.current.set(cacheKey, load);
            return load;
        },
        [
            loadedPostImageURLFor,
            onLoadPostImage,
            onPostSeen,
            unavailablePostsByKey,
        ],
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
        if (
            !selectedViewerPosts ||
            !friend ||
            selectedViewerPostIndex == undefined
        ) {
            return undefined;
        }

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
    }, [
        loadedPostImageURLFor,
        selectedViewer,
        selectedViewerPostIndex,
        selectedViewerPosts,
    ]);
    const handleSelectedViewerPostIndexChange = React.useCallback(
        (postIndex: number) => {
            const currentViewer = selectedViewer;
            const post = currentViewer?.posts?.[postIndex];
            const friend = currentViewer?.friend;
            if (!post || !friend) return;

            onPostSeen?.(post.spaceId, post.postId);
            const updateSelectedViewer = (imageUrl: string) => {
                setSelectedViewer((viewer) => {
                    if (
                        !viewer?.posts ||
                        viewer.posts !== currentViewer.posts
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
                if (loadedImageUrl) updateSelectedViewer(loadedImageUrl);
            });
        },
        [loadPostImage, loadedPostImageURLFor, onPostSeen, selectedViewer],
    );
    const setSelectedViewerPostLiked = React.useCallback(
        async (postID: number, liked: boolean) => {
            await onSetPostLiked?.(postID, liked);
            setSelectedViewer((viewer) =>
                viewer
                    ? {
                          ...viewer,
                          photo:
                              viewer.photo.postId == postID
                                  ? { ...viewer.photo, viewerLiked: liked }
                                  : viewer.photo,
                          posts: viewer.posts?.map((post) =>
                              post.postId == postID
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
    const friendPostCircleFor = (friend: FriendProfile, index: number) => {
        const placement = postCirclePlacements[index]!;
        const posts = (
            unseenPostsByFriendID.get(friend.spaceId ?? friend.id) ?? []
        ).filter(
            (post) =>
                !post.isUnavailable &&
                !unavailablePostsByKey[postImageCacheKey(post)],
        );
        const item = posts[0];
        const imageUrl = item ? loadedPostImageURLFor(item) : undefined;
        const avatarUrl = loadedFriendAvatarURLFor(friend);
        const isAvatarPending = Boolean(
            friend.avatarObjectID &&
            friend.avatarKeyVersion &&
            avatarUrl === undefined,
        );
        const isUnavailable = Boolean(
            item &&
            (item.isUnavailable ||
                unavailablePostsByKey[postImageCacheKey(item)]),
        );
        return (
            <FriendPostCircle
                key={friend.id}
                avatarUrl={avatarUrl}
                friend={friend}
                imageUrl={imageUrl}
                isAvatarPending={isAvatarPending}
                isLoading={isFriendsLoading || isLatestPostsLoading}
                isUnavailable={isUnavailable}
                onLoadAvatar={
                    isAvatarPending ? () => loadFriendAvatar(friend) : undefined
                }
                onLoadImage={
                    item && !imageUrl && !isUnavailable
                        ? () => loadPostImage(item)
                        : undefined
                }
                onOpenFriend={onOpenFriend}
                onOpenPosts={openPostPhotos}
                onPostUnavailable={onPostSeen}
                onWave={onWaveFriend ? () => onWaveFriend(friend) : undefined}
                placement={placement}
                posts={posts}
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

    React.useEffect(() => {
        if (
            !initialPostPhotoFile ||
            initialPostPhotoFileRef.current == initialPostPhotoFile ||
            isPostPhotoButtonDisabled
        ) {
            return;
        }

        initialPostPhotoFileRef.current = initialPostPhotoFile;
        setIsPostPhotoOpening(true);
        void prepareSelectedPostPhoto(initialPostPhotoFile)
            .catch((error: unknown) => {
                log.error("Failed to open post photo draft", error);
            })
            .finally(() => {
                onInitialPostPhotoConsumed?.();
                setIsPostPhotoOpening(false);
            });
    }, [
        initialPostPhotoFile,
        isPostPhotoButtonDisabled,
        onInitialPostPhotoConsumed,
        prepareSelectedPostPhoto,
    ]);

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
                background:
                    "radial-gradient(ellipse 120% 95% at 50% 58%, rgba(38, 78, 52, 0.16), transparent 72%), #0C1014",
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
                position: "relative",
            }}
        >
            {selectedViewer && (
                <SpaceViewerFeedBackdrop exiting={isDraftPostExitAnimating} />
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
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        background: "transparent",
                        boxSizing: "border-box",
                        display: "grid",
                        gap: "12px",
                        gridTemplateColumns: `${headerSideWidth}px minmax(0, 1fr) ${headerSideWidth}px`,
                        height: headerHeight,
                        color: "#FFF",
                        maxWidth: "100%",
                        pb: 2,
                        position: "relative",
                        pt: 1.5,
                        px: 2,
                        width: "100%",
                        zIndex: 4,
                        "&::before": {
                            WebkitBackdropFilter: "blur(4px)",
                            WebkitMaskImage:
                                "linear-gradient(to bottom, #000 0%, transparent 100%)",
                            backdropFilter: "blur(4px)",
                            background: `linear-gradient(to bottom, ${homeBackground}, rgba(0, 0, 0, 0.35) 75%, transparent)`,
                            content: '""',
                            height: "calc(100% + 28px)",
                            left: 0,
                            maskImage:
                                "linear-gradient(to bottom, #000 0%, transparent 100%)",
                            pointerEvents: "none",
                            position: "absolute",
                            right: 0,
                            top: 0,
                            zIndex: -1,
                        },
                        "@media (min-width: 600px)": { maxWidth: 390 },
                    }}
                >
                    <Box
                        ref={postInputRef}
                        component="input"
                        type="file"
                        accept={spacePostImageInputAccept}
                        onChange={handlePostPhotoSelect}
                        sx={{ display: "none" }}
                    />
                    <Box
                        component="button"
                        type="button"
                        aria-label="Open profile"
                        onClick={onOpenProfile}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            height: headerActionSize,
                            justifyContent: "center",
                            lineHeight: 0,
                            ml: "-6px",
                            overflow: "hidden",
                            p: 0,
                            placeSelf: "center start",
                            width: headerActionSize,
                        }}
                    >
                        <Box
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: `2.5px solid ${headerChromeColor}`,
                                borderRadius: "50%",
                                boxSizing: "border-box",
                                display: "flex",
                                height: headerAvatarSize,
                                justifyContent: "center",
                                overflow: "hidden",
                                p: "2.5px",
                                width: headerAvatarSize,
                            }}
                        >
                            {profile &&
                            (profile.avatarUrl || !profile.avatarObjectID) ? (
                                <Box
                                    key={profile.avatarUrl ?? "default-avatar"}
                                    sx={{
                                        ...avatarFadeSx,
                                        borderRadius: "50%",
                                        height: headerAvatarImageSize,
                                        overflow: "hidden",
                                        width: headerAvatarImageSize,
                                    }}
                                >
                                    <SpaceAvatarImage src={profile.avatarUrl} />
                                </Box>
                            ) : (
                                <Skeleton
                                    variant="circular"
                                    sx={{
                                        bgcolor: mediaSkeletonElementBackground,
                                        height: headerAvatarImageSize,
                                        transform: "none",
                                        width: headerAvatarImageSize,
                                    }}
                                />
                            )}
                        </Box>
                    </Box>
                    <Box
                        sx={{
                            alignItems: "center",
                            alignSelf: "center",
                            bgcolor: headerChromeColor,
                            borderRadius: "999px",
                            boxSizing: "border-box",
                            display: "flex",
                            height: 36,
                            justifyContent: "center",
                            justifySelf: "center",
                            lineHeight: 0,
                            minWidth: 0,
                            overflow: "visible",
                            placeSelf: "center",
                            px: "16px",
                        }}
                    >
                        <Box
                            component="img"
                            alt="Space"
                            src="/images/space.svg"
                            sx={{ display: "block", height: 18, width: "auto" }}
                        />
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label={
                            showUnreadIndicator
                                ? "Open messages with unread activity"
                                : "Open messages"
                        }
                        onClick={onOpenMessages}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            boxSizing: "border-box",
                            color: "#FFF",
                            cursor: onOpenMessages ? "pointer" : "default",
                            display: "flex",
                            fontSize: 0,
                            height: headerActionSize,
                            justifyContent: "center",
                            justifySelf: "end",
                            lineHeight: 0,
                            mr: "-6px",
                            p: 0,
                            position: "relative",
                            width: headerActionSize,
                            "& svg": { display: "block" },
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <Box
                            aria-hidden
                            sx={{
                                alignItems: "center",
                                bgcolor: headerChromeColor,
                                borderRadius: "50%",
                                display: "flex",
                                height: headerChatCircleSize,
                                justifyContent: "center",
                                position: "relative",
                                width: headerChatCircleSize,
                                "& svg path:first-of-type": { display: "none" },
                            }}
                        >
                            <HugeiconsIcon
                                icon={BubbleChatIcon}
                                size={headerIconSize}
                                strokeWidth={2.5}
                            />
                            {showUnreadIndicator && (
                                <Box
                                    sx={{
                                        bgcolor: dangerColor,
                                        border: `2px solid ${headerChromeColor}`,
                                        borderRadius: "50%",
                                        boxSizing: "border-box",
                                        height: 11,
                                        position: "absolute",
                                        right: 5.5,
                                        top: 6,
                                        width: 11,
                                        zIndex: 1,
                                    }}
                                />
                            )}
                        </Box>
                    </Box>
                </Box>
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        height: `calc(100svh - ${headerHeight}px)`,
                        minWidth: 0,
                        pb: "calc(env(safe-area-inset-bottom) + 112px)",
                        px: homeHorizontalPadding,
                        pt: `calc(env(safe-area-inset-bottom) + 112px - ${headerHeight}px)`,
                        width: "100%",
                    }}
                >
                    <Box
                        ref={postCircleCanvasRef}
                        sx={{
                            flex: "1 1 auto",
                            minHeight: 0,
                            position: "relative",
                            width: "100%",
                        }}
                    >
                        {initialPostPhotoFile ? null : isFriendsLoading &&
                          orderedFriends.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    display: "flex",
                                    height: "100%",
                                    justifyContent: "center",
                                    width: "100%",
                                }}
                            >
                                <SpaceLoadingSpinner ariaLabel="Loading friends" />
                            </Box>
                        ) : orderedFriends.length > 0 ? (
                            <Box
                                component="ul"
                                aria-label="Friends"
                                sx={{
                                    height: "100%",
                                    m: 0,
                                    p: 0,
                                    position: "relative",
                                    width: "100%",
                                }}
                            >
                                {postCirclePlacements.length ==
                                    orderedFriends.length &&
                                    orderedFriends.map(friendPostCircleFor)}
                            </Box>
                        ) : (
                            <Box
                                component="p"
                                sx={{
                                    alignItems: "center",
                                    color: textSecondary,
                                    display: "flex",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    height: "100%",
                                    justifyContent: "center",
                                    lineHeight: "20px",
                                    m: 0,
                                    px: 3,
                                    textAlign: "center",
                                }}
                            >
                                Your friends will show up here.
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
