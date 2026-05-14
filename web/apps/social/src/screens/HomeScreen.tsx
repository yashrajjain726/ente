import {
    AddSquareIcon,
    FavouriteIcon,
    NotificationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SocialActionFeedbackIcon,
    socialActionBusyDurationMs,
    socialActionDoneDurationMs,
    socialActionTransition,
    type SocialActionPhase,
} from "components/SocialActionFeedback";
import {
    SocialFileViewer,
    type SocialViewerInitialScreen,
    type SocialViewerPhoto,
    type SocialViewerPostActionMode,
} from "components/SocialFileViewer";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import {
    createLocalPostPhoto,
    type LocalPostPhotoDimensions,
} from "utils/localPostPhoto";
import { profileLinkForUsername } from "utils/profileLink";
import { firstNameFrom, formatSocialDate } from "utils/socialDisplay";

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
const feedLikeActionInset = 6;
const feedLikeActionSize = 40;
const feedLikeActionBackground = "rgba(0, 0, 0, 0.16)";
const feedLikeActionBackgroundHover = "rgba(0, 0, 0, 0.24)";

const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);
const sampleFeedLandscapePhotoAspectRatio = 900 / 680;
const sampleFeedPortraitPhotoAspectRatio = 680 / 1020;
const showMockFeedData =
    process.env.NEXT_PUBLIC_HIDE_SOCIAL_MOCK_FEED != "true";
type PostActionPhase = "posting" | "posted";

const sampleFeedItems = [
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-1.jpg",
        likeCount: 18,
        commentCount: 6,
        name: "Aparna Bhatnagar",
        timestampMs: minutesAgo(22),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-portrait-2.jpg",
        likeCount: 24,
        commentCount: 9,
        name: "Mira Sen",
        timestampMs: hoursAgo(2),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-2.jpg",
        likeCount: 15,
        commentCount: 4,
        name: "Mira Sen",
        timestampMs: hoursAgo(3),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-portrait-3.jpg",
        likeCount: 31,
        commentCount: 12,
        name: "Nikhil Rao",
        timestampMs: hoursAgo(7),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-3.jpg",
        likeCount: 11,
        commentCount: 3,
        name: "Nikhil Rao",
        timestampMs: daysAgo(1),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        friendID: "riya-kapoor",
        imageUrl: "/images/sample-feed-portrait-4.jpg",
        likeCount: 28,
        commentCount: 8,
        name: "Riya Kapoor",
        timestampMs: daysAgo(1) - 3 * 60 * 60 * 1000,
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        friendID: "riya-kapoor",
        imageUrl: "/images/sample-feed-4.jpg",
        likeCount: 16,
        commentCount: 5,
        name: "Riya Kapoor",
        timestampMs: daysAgo(2),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-portrait-1.jpg",
        likeCount: 22,
        commentCount: 7,
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(3),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-5.jpg",
        likeCount: 13,
        commentCount: 4,
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(4),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-portrait-5.jpg",
        likeCount: 36,
        commentCount: 14,
        name: "Mira Sen",
        timestampMs: daysAgo(6),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-6.jpg",
        likeCount: 19,
        commentCount: 6,
        name: "Mira Sen",
        timestampMs: daysAgo(8),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-portrait-6.jpg",
        likeCount: 27,
        commentCount: 10,
        name: "Nikhil Rao",
        timestampMs: daysAgo(12),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-2.jpg",
        likeCount: 43,
        commentCount: 17,
        name: "Nikhil Rao",
        timestampMs: new Date(new Date().getFullYear() - 1, 10, 18).getTime(),
    },
];

interface HomeScreenProps {
    friendsCount: number;
    onOpenFriend?: (friendID: string) => void;
    onOpenNotifications?: () => void;
    onOpenProfile?: () => void;
    profile: SetupProfile;
}

interface FeedPhotoDimensions {
    height: number;
    width: number;
}

interface SelectedHomeViewer {
    initialScreen: SocialViewerInitialScreen;
    localObjectUrl?: string;
    photo: SocialViewerPhoto;
    postActionMode?: SocialViewerPostActionMode;
    showPostCaptionInput?: boolean;
}

interface FeedItemProps {
    aspectRatio: number;
    avatarUrl: string;
    friendID: string;
    imageUrl: string;
    name: string;
    onOpenFriend?: (friendID: string) => void;
    onOpenPhoto?: (
        photo: SocialViewerPhoto,
        initialScreen?: SocialViewerInitialScreen,
    ) => void;
    timestampMs: number;
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
    name,
    onOpenFriend,
    onOpenPhoto,
    timestampMs,
}) => {
    const [isLiked, setIsLiked] = useState(false);
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
                name,
                timestampMs,
                width: photoDimensions.width,
            },
            initialScreen,
        );
    const handleLikeClick = () => {
        if (likePopTimeoutRef.current != null)
            window.clearTimeout(likePopTimeoutRef.current);

        setIsLikeButtonPopping(true);
        setIsLiked((current) => !current);
        likePopTimeoutRef.current = window.setTimeout(() => {
            likePopTimeoutRef.current = null;
            setIsLikeButtonPopping(false);
        }, 120);
    };

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
                        display: "block",
                        flexShrink: 0,
                        height: feedAvatarSize,
                        overflow: "hidden",
                        p: 0,
                        width: feedAvatarSize,
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                    }}
                >
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
                        bgcolor: feedLikeActionBackground,
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
                        transition:
                            "background-color 120ms ease, color 120ms ease, transform 120ms ease",
                        width: feedLikeActionSize,
                        zIndex: 1,
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                        "&:hover": {
                            bgcolor: feedLikeActionBackgroundHover,
                        },
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

export const HomeScreen: React.FC<HomeScreenProps> = ({
    friendsCount,
    onOpenFriend,
    onOpenNotifications,
    onOpenProfile,
    profile,
}) => {
    const [selectedViewer, setSelectedViewer] =
        useState<SelectedHomeViewer | null>(null);
    const [postActionPhase, setPostActionPhase] =
        useState<PostActionPhase | null>(null);
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const localPostObjectUrlsRef = React.useRef<Set<string>>(new Set());
    const pendingPostViewerRef = React.useRef<SelectedHomeViewer | null>(null);
    const selectedPhotoFriendID = selectedViewer?.photo.friendID;
    const feedItems = showMockFeedData ? sampleFeedItems : [];
    const hasFeedItems = feedItems.length > 0;
    const emptyFeedMessage =
        friendsCount == 0
            ? "When you add friends, their posts will appear here."
            : "When your friends share posts, they'll appear here.";
    const profileLink = profileLinkForUsername(profile.username.trim());
    const isPostActionPosting = postActionPhase == "posting";
    const isPostActionPosted = postActionPhase == "posted";
    const postActionFeedbackPhase: SocialActionPhase | null =
        postActionPhase == "posting"
            ? "busy"
            : postActionPhase == "posted"
              ? "done"
              : null;
    const initialsSource = profile.fullName.trim() || profile.username.trim();
    const initials = initialsSource
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    const revokeLocalPostObjectUrl = React.useCallback((objectUrl?: string) => {
        if (!objectUrl || !localPostObjectUrlsRef.current.has(objectUrl))
            return;

        URL.revokeObjectURL(objectUrl);
        localPostObjectUrlsRef.current.delete(objectUrl);
    }, []);
    const applyLocalPostDimensions = React.useCallback(
        (objectUrl: string, dimensions: LocalPostPhotoDimensions) => {
            const pendingViewer = pendingPostViewerRef.current;
            if (pendingViewer?.localObjectUrl == objectUrl) {
                pendingPostViewerRef.current = {
                    ...pendingViewer,
                    photo: { ...pendingViewer.photo, ...dimensions },
                };
            }

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

        revokeLocalPostObjectUrl(pendingPostViewerRef.current?.localObjectUrl);
        pendingPostViewerRef.current = null;

        const localPost = createLocalPostPhoto({
            avatarUrl: profile.avatarUrl,
            file,
            name: initialsSource || "You",
            onDimensionsLoaded: applyLocalPostDimensions,
        });
        localPostObjectUrlsRef.current.add(localPost.objectUrl);
        pendingPostViewerRef.current = {
            initialScreen: "photo",
            localObjectUrl: localPost.objectUrl,
            photo: localPost.photo,
            postActionMode: "like-with-count",
            showPostCaptionInput: true,
        };

        setPostActionPhase("posting");
    };

    React.useEffect(() => {
        if (!postActionPhase) return;

        const timeoutID = window.setTimeout(
            () => {
                if (postActionPhase == "posting") {
                    setPostActionPhase("posted");
                    return;
                }

                const postedViewer = pendingPostViewerRef.current;
                pendingPostViewerRef.current = null;
                if (postedViewer) setSelectedViewer(postedViewer);
                setPostActionPhase(null);
            },
            postActionPhase == "posting"
                ? socialActionBusyDurationMs
                : socialActionDoneDurationMs,
        );
        return () => window.clearTimeout(timeoutID);
    }, [postActionPhase]);

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
                        aria-label={
                            isPostActionPosting
                                ? "Posting photo"
                                : isPostActionPosted
                                  ? "Photo posted"
                                  : "Post photo"
                        }
                        disabled={postActionPhase != null}
                        onClick={openPostPhotoPicker}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            boxSizing: "border-box",
                            color: isPostActionPosted ? green : textBase,
                            cursor:
                                postActionPhase == null ? "pointer" : "default",
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
                            transition: `color ${socialActionTransition}`,
                            "& svg": { display: "block" },
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <SocialActionFeedbackIcon
                            idleIcon={
                                <HugeiconsIcon
                                    icon={AddSquareIcon}
                                    size={headerAddIconSize}
                                    strokeWidth={1.8}
                                />
                            }
                            phase={postActionFeedbackPhase}
                            size={headerAddIconSize}
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
                        pt: hasFeedItems ? "22px" : 0,
                        width: "100%",
                    }}
                >
                    {hasFeedItems ? (
                        feedItems.map((item) => (
                            <FeedItem
                                key={`${item.name}-${item.imageUrl}`}
                                aspectRatio={item.aspectRatio}
                                avatarUrl={item.avatarUrl}
                                friendID={item.friendID}
                                imageUrl={item.imageUrl}
                                name={item.name}
                                onOpenFriend={onOpenFriend}
                                onOpenPhoto={openFeedPhoto}
                                timestampMs={item.timestampMs}
                            />
                        ))
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
                                    width: 156,
                                    "@media (max-width: 340px)": { width: 140 },
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
                                    mt: "36px",
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
                                        mt: "18px",
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
                                    Share link
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>
                {selectedViewer && (
                    <SocialFileViewer
                        currentUser={{
                            avatarUrl: profile.avatarUrl,
                            name: initialsSource,
                        }}
                        initialScreen={selectedViewer.initialScreen}
                        photo={selectedViewer.photo}
                        postActionMode={
                            selectedViewer.postActionMode ?? "like-with-count"
                        }
                        showPostCaptionInput={
                            selectedViewer.showPostCaptionInput
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
                    />
                )}
            </Box>
        </Box>
    );
};
