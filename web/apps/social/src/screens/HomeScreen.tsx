import {
    AddSquareIcon,
    FavouriteIcon,
    MultiplicationSignIcon,
    NotificationIcon,
    UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SocialFileViewer,
    type SocialLiker,
    type SocialViewerInitialScreen,
    type SocialViewerPhoto,
    type SocialViewerPostActionMode,
} from "components/SocialFileViewer";
import { SocialLoadingSpinner } from "components/SocialRouteFallback";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import type { SocialWallPost } from "services/socialWall";
import {
    createLocalPostPhoto,
    type LocalPostPhotoDimensions,
} from "utils/localPostPhoto";
import {
    firstNameFrom,
    formatSocialDate,
    initialsFor,
} from "utils/socialDisplay";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const feedCardBackground = "#F5F5F5";
const textBase = "#000";
const textSecondary = "#6B6B6B";
const feedAvatarSize = 26;
const headerActionSize = 32;
const headerActionGap = 8;
const headerAddIconSize = 24;
const headerAvatarSize = 23;
const headerIconSize = 23;
const headerSideWidth = headerActionSize * 2 + headerActionGap;
const feedLikeActionInset = 4;
const feedLikeActionSize = 40;
const emptyFeedItemGap = "22px";

interface HomeScreenProps {
    addedFriendToastName?: string;
    feedItems: SocialWallPost[];
    friendsCount: number;
    isFeedLoading?: boolean;
    onAddedFriendToastClose?: () => void;
    onCreatePost?: (file: File, caption: string) => Promise<SocialViewerPhoto>;
    onOpenFriend?: (friendID: string) => void;
    onOpenNotifications?: () => void;
    onOpenProfile?: () => void;
    onLoadPostLikers?: (postId: number) => Promise<SocialLiker[]>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    onShareProfileLink?: () => Promise<string>;
    profile: SetupProfile;
}

interface FeedPhotoDimensions {
    height: number;
    width: number;
}

interface SelectedHomeViewer {
    draftFile?: File;
    initialScreen: SocialViewerInitialScreen;
    localObjectUrl?: string;
    photo: SocialViewerPhoto;
    postActionMode?: SocialViewerPostActionMode;
}

interface FeedItemProps {
    aspectRatio: number;
    avatarUrl?: string | null;
    friendID: string;
    imageUrl: string;
    likeCount: number;
    name: string;
    onOpenFriend?: (friendID: string) => void;
    onOpenPhoto?: (
        photo: SocialViewerPhoto,
        initialScreen?: SocialViewerInitialScreen,
    ) => void;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    postId: number;
    timestampMs: number;
    viewerLiked: boolean;
}

interface AddedFriendToastProps {
    name: string;
    onClose?: () => void;
}

const dimensionsFromAspectRatio = (
    aspectRatio: number,
): FeedPhotoDimensions => {
    const safeAspectRatio =
        Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    const height = 1000;

    return { height, width: Math.round(safeAspectRatio * height) };
};

const FeedItem: React.FC<FeedItemProps> = ({
    aspectRatio,
    avatarUrl,
    friendID,
    imageUrl,
    likeCount,
    name,
    onOpenFriend,
    onOpenPhoto,
    onSetPostLiked,
    postId,
    timestampMs,
    viewerLiked,
}) => {
    const [isLiked, setIsLiked] = useState(viewerLiked);
    const [localLikeCount, setLocalLikeCount] = useState(likeCount);
    const [isLikeButtonPopping, setIsLikeButtonPopping] = useState(false);
    const firstName = firstNameFrom(name);
    const dateLabel = formatSocialDate(timestampMs);
    const openFriend = () => onOpenFriend?.(friendID);
    const likePopTimeoutRef = React.useRef<number | null>(null);
    const [loadedPhotoDimensions, setLoadedPhotoDimensions] =
        useState<FeedPhotoDimensions | null>(null);
    const photoDimensions =
        loadedPhotoDimensions ?? dimensionsFromAspectRatio(aspectRatio);
    const rememberLoadedPhotoDimensions: React.ReactEventHandler<
        HTMLImageElement
    > = ({ currentTarget }) => {
        const { naturalHeight, naturalWidth } = currentTarget;
        if (!naturalHeight || !naturalWidth) return;

        setLoadedPhotoDimensions((currentDimensions) => {
            if (
                currentDimensions?.height == naturalHeight &&
                currentDimensions.width == naturalWidth
            ) {
                return currentDimensions;
            }

            return { height: naturalHeight, width: naturalWidth };
        });
    };
    const openPhoto = (initialScreen?: SocialViewerInitialScreen) =>
        onOpenPhoto?.(
            {
                alt: `${name} post`,
                avatarUrl,
                friendID,
                height: photoDimensions.height,
                imageUrl,
                likeCount: localLikeCount,
                name,
                postId,
                timestampMs,
                viewerLiked: isLiked,
                width: photoDimensions.width,
            },
            initialScreen,
        );
    const handleLikeClick = () => {
        if (likePopTimeoutRef.current != null)
            window.clearTimeout(likePopTimeoutRef.current);

        setIsLikeButtonPopping(true);
        const nextLiked = !isLiked;
        setIsLiked(nextLiked);
        setLocalLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
        void onSetPostLiked?.(postId, nextLiked).catch((error: unknown) => {
            console.error("Failed to update post like", error);
            setIsLiked(!nextLiked);
            setLocalLikeCount((count) =>
                Math.max(0, count + (nextLiked ? -1 : 1)),
            );
        });
        likePopTimeoutRef.current = window.setTimeout(() => {
            likePopTimeoutRef.current = null;
            setIsLikeButtonPopping(false);
        }, 120);
    };

    React.useEffect(() => {
        setIsLiked(viewerLiked);
    }, [viewerLiked]);

    React.useEffect(() => {
        setLocalLikeCount(likeCount);
    }, [likeCount]);

    React.useEffect(
        () => () => {
            if (likePopTimeoutRef.current != null)
                window.clearTimeout(likePopTimeoutRef.current);
        },
        [],
    );

    return (
        <Box
            component="article"
            sx={{
                bgcolor: feedCardBackground,
                borderRadius: "16px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                mx: "16px",
                p: "12px",
                width: "calc(100% - 32px)",
            }}
        >
            <Box
                sx={{
                    alignItems: "center",
                    boxSizing: "border-box",
                    color: textBase,
                    display: "grid",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    gap: "8px",
                    gridTemplateColumns: `${feedAvatarSize}px minmax(0, 1fr) auto`,
                    lineHeight: "20px",
                    mb: "10px",
                    minHeight: 32,
                    px: "4px",
                    width: "100%",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label={`Open ${firstName}'s profile`}
                    onClick={openFriend}
                    sx={{
                        appearance: "none",
                        bgcolor: paleGreen,
                        borderRadius: "50%",
                        border: 0,
                        cursor: onOpenFriend ? "pointer" : "default",
                        display: "flex",
                        flexShrink: 0,
                        height: feedAvatarSize,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        p: 0,
                        width: feedAvatarSize,
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                    }}
                >
                    {avatarUrl ? (
                        <Box
                            component="img"
                            alt=""
                            src={avatarUrl}
                            sx={{
                                display: "block",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: "center",
                                width: "100%",
                            }}
                        />
                    ) : (
                        <Box
                            sx={{
                                color: green,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 9,
                                fontWeight: 800,
                                lineHeight: 1,
                            }}
                        >
                            {initialsFor(name)}
                        </Box>
                    )}
                </Box>
                <Box
                    component="button"
                    type="button"
                    aria-label={`Open ${firstName}'s profile`}
                    onClick={openFriend}
                    sx={{
                        appearance: "none",
                        bgcolor: "transparent",
                        border: 0,
                        color: "inherit",
                        cursor: onOpenFriend ? "pointer" : "default",
                        display: "block",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        fontWeight: 650,
                        justifySelf: "start",
                        lineHeight: "inherit",
                        maxWidth: "100%",
                        minWidth: 0,
                        overflow: "hidden",
                        p: 0,
                        textAlign: "left",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        "&:focus-visible": {
                            borderRadius: "4px",
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                    }}
                >
                    {firstName}
                </Box>
                <Box
                    component="time"
                    dateTime={new Date(timestampMs).toISOString()}
                    sx={{
                        color: textSecondary,
                        fontSize: 12,
                        fontWeight: 500,
                        justifySelf: "end",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                    }}
                >
                    {dateLabel}
                </Box>
            </Box>
            <Box
                sx={{
                    aspectRatio: `${photoDimensions.width} / ${photoDimensions.height}`,
                    bgcolor: paleGreen,
                    borderRadius: "12px",
                    overflow: "hidden",
                    position: "relative",
                    width: "100%",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label={`Open ${name} photo`}
                    onClick={() => openPhoto()}
                    sx={{
                        appearance: "none",
                        bgcolor: "transparent",
                        border: 0,
                        cursor: onOpenPhoto ? "pointer" : "default",
                        display: "block",
                        height: "100%",
                        p: 0,
                        width: "100%",
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: -2,
                        },
                    }}
                >
                    <Box
                        component="img"
                        alt={`${name} post`}
                        src={imageUrl}
                        onLoad={rememberLoadedPhotoDimensions}
                        sx={{
                            display: "block",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center",
                            width: "100%",
                        }}
                    />
                </Box>
                <Box
                    component="button"
                    type="button"
                    aria-label={isLiked ? "Unlike post" : "Like post"}
                    aria-pressed={isLiked}
                    onClick={handleLikeClick}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: "transparent",
                        border: 0,
                        borderRadius: "50%",
                        bottom: feedLikeActionInset,
                        color: "#FFFFFF",
                        cursor: "pointer",
                        display: "inline-flex",
                        height: feedLikeActionSize,
                        justifyContent: "center",
                        p: 0,
                        position: "absolute",
                        right: feedLikeActionInset,
                        transform: isLikeButtonPopping
                            ? "scale(0.96)"
                            : "scale(1)",
                        transition: "color 120ms ease, transform 120ms ease",
                        width: feedLikeActionSize,
                        zIndex: 1,
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                        "&:hover": { bgcolor: "transparent" },
                    }}
                >
                    <HugeiconsIcon
                        fill={isLiked ? green : "none"}
                        icon={FavouriteIcon}
                        primaryColor={isLiked ? green : "#FFFFFF"}
                        size={23}
                        strokeWidth={1.8}
                    />
                </Box>
            </Box>
        </Box>
    );
};

const AddedFriendToast: React.FC<AddedFriendToastProps> = ({
    name,
    onClose,
}) => (
    <Box
        sx={{
            bottom: "calc(env(safe-area-inset-bottom) + 16px)",
            boxSizing: "border-box",
            left: "50%",
            maxWidth: 390,
            px: 2,
            pointerEvents: "none",
            position: "fixed",
            transform: "translateX(-50%)",
            width: "100%",
            zIndex: 20,
        }}
    >
        <Box
            className="green-bg"
            role="status"
            aria-live="polite"
            sx={{
                alignItems: "center",
                bgcolor: green,
                borderRadius: "18px",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
                boxSizing: "border-box",
                color: "#FFFFFF",
                display: "flex",
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 14,
                fontWeight: 650,
                gap: "10px",
                lineHeight: "20px",
                minHeight: 48,
                pointerEvents: "auto",
                pl: "16px",
                pr: "10px",
                py: "10px",
                width: "100%",
            }}
        >
            <Box component="span" sx={{ display: "flex", flexShrink: 0 }}>
                <HugeiconsIcon
                    icon={UserCheck01Icon}
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
                You&apos;re now friends with {name}!
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
                    borderRadius: "50%",
                    color: "#FFFFFF",
                    cursor: onClose ? "pointer" : "default",
                    display: "flex",
                    flexShrink: 0,
                    height: 24,
                    justifyContent: "center",
                    opacity: 0.9,
                    p: 0,
                    width: 24,
                    "&:focus-visible": {
                        outline: "2px solid rgba(255 255 255 / 0.9)",
                        outlineOffset: 2,
                    },
                    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)" },
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
    addedFriendToastName,
    feedItems,
    friendsCount,
    isFeedLoading = false,
    onAddedFriendToastClose,
    onCreatePost,
    onLoadPostLikers,
    onOpenFriend,
    onOpenNotifications,
    onOpenProfile,
    onSetPostLiked,
    onShareProfileLink,
    profile,
}) => {
    const [selectedViewer, setSelectedViewer] =
        useState<SelectedHomeViewer | null>(null);
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const localPostObjectUrlsRef = React.useRef<Set<string>>(new Set());
    const selectedPhotoFriendID = selectedViewer?.photo.friendID;
    const hasFeedItems = feedItems.length > 0;
    const isEmptyFeedLoading = !hasFeedItems && isFeedLoading;
    const emptyFeedMessage =
        friendsCount == 0
            ? "When you add friends, their posts will appear here."
            : "When your friends share posts, they'll appear here.";
    const initialsSource = profile.fullName.trim() || profile.username.trim();
    const initials = initialsFor(initialsSource);
    const revokeLocalPostObjectUrl = React.useCallback((objectUrl?: string) => {
        if (!objectUrl || !localPostObjectUrlsRef.current.has(objectUrl))
            return;

        URL.revokeObjectURL(objectUrl);
        localPostObjectUrlsRef.current.delete(objectUrl);
    }, []);
    const applyLocalPostDimensions = React.useCallback(
        (objectUrl: string, dimensions: LocalPostPhotoDimensions) => {
            setSelectedViewer((currentViewer) =>
                currentViewer?.localObjectUrl == objectUrl
                    ? {
                          ...currentViewer,
                          photo: { ...currentViewer.photo, ...dimensions },
                      }
                    : currentViewer,
            );
        },
        [],
    );
    const openPostPhotoPicker = () => postInputRef.current?.click();
    const openFeedPhoto = (
        photo: SocialViewerPhoto,
        initialScreen: SocialViewerInitialScreen = "photo",
    ) => {
        setSelectedViewer({
            initialScreen,
            photo,
            postActionMode: "like-only",
        });
    };
    const closeSelectedPhoto = () => {
        const localObjectUrl = selectedViewer?.localObjectUrl;
        setSelectedViewer(null);
        revokeLocalPostObjectUrl(localObjectUrl);
    };

    const shareProfileLink = async () => {
        if (!onShareProfileLink) return;
        const profileLink = await onShareProfileLink();
        if (typeof navigator.share == "function") {
            try {
                await navigator.share({ url: profileLink });
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name == "AbortError")
                    return;
            }
        }

        await navigator.clipboard.writeText(profileLink);
    };

    const handlePostPhotoSelect: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        const localPost = createLocalPostPhoto({
            avatarUrl: profile.avatarUrl,
            file,
            name: initialsSource || "You",
            onDimensionsLoaded: applyLocalPostDimensions,
        });
        localPostObjectUrlsRef.current.add(localPost.objectUrl);
        setSelectedViewer({
            draftFile: file,
            initialScreen: "photo",
            localObjectUrl: localPost.objectUrl,
            photo: localPost.photo,
            postActionMode: "draft-post",
        });
    };

    React.useEffect(
        () => () => {
            localPostObjectUrlsRef.current.forEach((objectUrl) =>
                URL.revokeObjectURL(objectUrl),
            );
            localPostObjectUrlsRef.current.clear();
        },
        [],
    );

    return (
        <Box
            component="main"
            sx={{
                bgcolor: homeBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: homeBackground,
                    boxSizing: "border-box",
                    minHeight: "100svh",
                    mx: "auto",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gap: "12px",
                        gridTemplateColumns: `${headerSideWidth}px minmax(0, 1fr) ${headerSideWidth}px`,
                        boxSizing: "border-box",
                        pb: 2,
                        pt: 1.5,
                        px: 1.25,
                        width: "100%",
                    }}
                >
                    <Box
                        ref={postInputRef}
                        component="input"
                        type="file"
                        accept="image/*"
                        onChange={handlePostPhotoSelect}
                        sx={{ display: "none" }}
                    />
                    <Box
                        component="button"
                        type="button"
                        aria-label="Post photo"
                        onClick={openPostPhotoPicker}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            boxSizing: "border-box",
                            color: textBase,
                            cursor: "pointer",
                            display: "flex",
                            fontSize: 0,
                            height: headerActionSize,
                            justifyContent: "center",
                            lineHeight: 0,
                            ml: 0,
                            opacity: 1,
                            p: 0,
                            placeSelf: "center start",
                            width: headerActionSize,
                            "& svg": { display: "block" },
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <HugeiconsIcon
                            icon={AddSquareIcon}
                            size={headerAddIconSize}
                            strokeWidth={1.8}
                        />
                    </Box>
                    <Box
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            justifySelf: "center",
                            lineHeight: 0,
                            minWidth: 0,
                            overflow: "visible",
                            placeSelf: "center",
                            width: 58,
                            "& svg": { display: "block", overflow: "visible" },
                        }}
                    >
                        <EnteLogo height={18} />
                    </Box>
                    <Box
                        sx={{
                            alignItems: "center",
                            display: "flex",
                            gap: `${headerActionGap}px`,
                            justifyContent: "flex-end",
                            justifySelf: "flex-end",
                            minWidth: 0,
                            width: "100%",
                        }}
                    >
                        <Box
                            component="button"
                            type="button"
                            aria-label="Open notifications"
                            onClick={onOpenNotifications}
                            sx={{
                                appearance: "none",
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                boxSizing: "border-box",
                                color: textBase,
                                cursor: onOpenNotifications
                                    ? "pointer"
                                    : "default",
                                display: "flex",
                                fontSize: 0,
                                height: headerActionSize,
                                justifyContent: "center",
                                lineHeight: 0,
                                p: 0,
                                width: headerActionSize,
                                "& svg": { display: "block" },
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={NotificationIcon}
                                size={headerIconSize}
                                strokeWidth={1.8}
                            />
                        </Box>
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
                                overflow: "visible",
                                p: 0,
                                pr: "2.5px",
                                width: headerActionSize,
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    alignItems: "center",
                                    bgcolor: profile.avatarUrl
                                        ? "transparent"
                                        : paleGreen,
                                    borderRadius: "50%",
                                    display: "flex",
                                    height: headerAvatarSize,
                                    justifyContent: "center",
                                    overflow: "hidden",
                                    width: headerAvatarSize,
                                }}
                            >
                                {profile.avatarUrl ? (
                                    <Box
                                        component="img"
                                        alt=""
                                        src={profile.avatarUrl}
                                        sx={{
                                            display: "block",
                                            height: "100%",
                                            borderRadius: "50%",
                                            objectFit: "cover",
                                            objectPosition: "center",
                                            width: "100%",
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            color: green,
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            lineHeight: 1,
                                        }}
                                    >
                                        {initials}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </Box>
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: hasFeedItems ? "24px" : 0,
                        justifyContent: hasFeedItems ? "flex-start" : "center",
                        minHeight: "calc(100svh - 64px)",
                        pb: hasFeedItems ? "16px" : "56px",
                        pt: 0,
                        width: "100%",
                    }}
                >
                    {hasFeedItems ? (
                        feedItems.map((item) => (
                            <FeedItem
                                key={`${item.name}-${item.imageUrl}`}
                                aspectRatio={
                                    item.width && item.height
                                        ? item.width / item.height
                                        : 1
                                }
                                avatarUrl={item.avatarUrl ?? ""}
                                friendID={item.friendID}
                                imageUrl={item.imageUrl}
                                likeCount={item.likeCount}
                                name={item.name}
                                onOpenFriend={onOpenFriend}
                                onOpenPhoto={openFeedPhoto}
                                onSetPostLiked={onSetPostLiked}
                                postId={item.postId}
                                timestampMs={item.timestampMs}
                                viewerLiked={item.viewerLiked}
                            />
                        ))
                    ) : isEmptyFeedLoading ? (
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                justifyContent: "center",
                                width: "100%",
                            }}
                        >
                            <SocialLoadingSpinner ariaLabel="Loading posts" />
                        </Box>
                    ) : (
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                px: 3,
                                textAlign: "center",
                                width: "100%",
                            }}
                        >
                            <Box
                                component="img"
                                alt=""
                                src="/images/share-memories.svg"
                                sx={{
                                    display: "block",
                                    height: "auto",
                                    width: 220,
                                    "@media (max-width: 340px)": { width: 196 },
                                }}
                            />
                            <Box
                                component="p"
                                sx={{
                                    color: textSecondary,
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    m: 0,
                                    mt: emptyFeedItemGap,
                                    maxWidth: 220,
                                }}
                            >
                                {emptyFeedMessage}
                            </Box>
                            {friendsCount == 0 && (
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={shareProfileLink}
                                    sx={{
                                        alignItems: "center",
                                        bgcolor: "#F2F2F2",
                                        border: 0,
                                        borderRadius: "18px",
                                        color: textBase,
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        gap: "6px",
                                        height: 36,
                                        justifyContent: "center",
                                        lineHeight: "18px",
                                        mt: emptyFeedItemGap,
                                        px: "14px",
                                        whiteSpace: "nowrap",
                                        "&:focus-visible": {
                                            outline: `2px solid ${green}`,
                                            outlineOffset: 2,
                                        },
                                        "&:hover": { bgcolor: "#E8E8E8" },
                                    }}
                                >
                                    <ShareIcon />
                                    Share profile
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>
                {selectedViewer && (
                    <SocialFileViewer
                        initialScreen={selectedViewer.initialScreen}
                        photo={selectedViewer.photo}
                        postActionMode={
                            selectedViewer.postActionMode ?? "like-with-count"
                        }
                        onClose={closeSelectedPhoto}
                        onOpenFriend={
                            onOpenFriend
                                ? (friendID) => {
                                      closeSelectedPhoto();
                                      onOpenFriend(friendID);
                                  }
                                : undefined
                        }
                        onOpenProfile={
                            selectedPhotoFriendID && onOpenFriend
                                ? () => {
                                      closeSelectedPhoto();
                                      onOpenFriend(selectedPhotoFriendID);
                                  }
                                : undefined
                        }
                        onLoadPostLikers={onLoadPostLikers}
                        onPublishDraftPost={
                            selectedViewer.draftFile && onCreatePost
                                ? async (caption) => {
                                      const localObjectUrl =
                                          selectedViewer.localObjectUrl;
                                      const post = await onCreatePost(
                                          selectedViewer.draftFile!,
                                          caption,
                                      );
                                      revokeLocalPostObjectUrl(localObjectUrl);
                                      setSelectedViewer((currentViewer) =>
                                          currentViewer
                                              ? {
                                                    initialScreen: "photo",
                                                    photo: post,
                                                    postActionMode:
                                                        "like-with-count",
                                                }
                                              : currentViewer,
                                      );
                                  }
                                : undefined
                        }
                        onSetPostLiked={onSetPostLiked}
                    />
                )}
                {addedFriendToastName && (
                    <AddedFriendToast
                        name={addedFriendToastName}
                        onClose={onAddedFriendToastClose}
                    />
                )}
            </Box>
        </Box>
    );
};
