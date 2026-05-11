import { AddSquareIcon } from "@hugeicons/core-free-icons";
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
    type SocialViewerPhoto,
} from "components/SocialFileViewer";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import { profileLinkForUsername } from "utils/profileLink";
import { firstNameFrom, formatSocialDate } from "utils/socialDisplay";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const feedCardBackground = "#F5F5F5";
const textBase = "#000";
const textSecondary = "#6B6B6B";

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
        name: "Aparna Bhatnagar",
        timestampMs: minutesAgo(22),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-portrait-2.jpg",
        name: "Mira Sen",
        timestampMs: hoursAgo(2),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Mira Sen",
        timestampMs: hoursAgo(3),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-portrait-3.jpg",
        name: "Nikhil Rao",
        timestampMs: hoursAgo(7),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-3.jpg",
        name: "Nikhil Rao",
        timestampMs: daysAgo(1),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        friendID: "riya-kapoor",
        imageUrl: "/images/sample-feed-portrait-4.jpg",
        name: "Riya Kapoor",
        timestampMs: daysAgo(1) - 3 * 60 * 60 * 1000,
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        friendID: "riya-kapoor",
        imageUrl: "/images/sample-feed-4.jpg",
        name: "Riya Kapoor",
        timestampMs: daysAgo(2),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-portrait-1.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(3),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-5.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(4),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-portrait-5.jpg",
        name: "Mira Sen",
        timestampMs: daysAgo(6),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-6.jpg",
        name: "Mira Sen",
        timestampMs: daysAgo(8),
    },
    {
        aspectRatio: sampleFeedPortraitPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-portrait-6.jpg",
        name: "Nikhil Rao",
        timestampMs: daysAgo(12),
    },
    {
        aspectRatio: sampleFeedLandscapePhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Nikhil Rao",
        timestampMs: new Date(new Date().getFullYear() - 1, 10, 18).getTime(),
    },
];

interface HomeScreenProps {
    friendsCount: number;
    onOpenFriend?: (friendID: string) => void;
    onOpenProfile?: () => void;
    profile: SetupProfile;
}

interface FeedPhotoDimensions {
    height: number;
    width: number;
}

interface FeedItemProps {
    aspectRatio: number;
    avatarUrl: string;
    friendID: string;
    imageUrl: string;
    name: string;
    onOpenFriend?: (friendID: string) => void;
    onOpenPhoto?: (photo: SocialViewerPhoto) => void;
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
    const firstName = firstNameFrom(name);
    const dateLabel = formatSocialDate(timestampMs);
    const openFriend = () => onOpenFriend?.(friendID);
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
                    gap: "10px",
                    gridTemplateColumns: "28px minmax(0, 1fr) auto",
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
                        height: 28,
                        overflow: "hidden",
                        p: 0,
                        width: 28,
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
                        lineHeight: "inherit",
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
                component="button"
                type="button"
                aria-label={`Open ${name} photo`}
                onClick={() =>
                    onOpenPhoto?.({
                        alt: `${name} post`,
                        avatarUrl,
                        friendID,
                        height: photoDimensions.height,
                        imageUrl,
                        name,
                        timestampMs,
                        width: photoDimensions.width,
                    })
                }
                sx={{
                    appearance: "none",
                    aspectRatio: `${photoDimensions.width} / ${photoDimensions.height}`,
                    bgcolor: paleGreen,
                    border: 0,
                    borderRadius: "12px",
                    display: "block",
                    cursor: onOpenPhoto ? "pointer" : "default",
                    overflow: "hidden",
                    p: 0,
                    width: "100%",
                    "&:focus-visible": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 2,
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
        </Box>
    );
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
    friendsCount,
    onOpenFriend,
    onOpenProfile,
    profile,
}) => {
    const [selectedPhoto, setSelectedPhoto] =
        useState<SocialViewerPhoto | null>(null);
    const [postActionPhase, setPostActionPhase] =
        useState<PostActionPhase | null>(null);
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const selectedPhotoFriendID = selectedPhoto?.friendID;
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
    const openPostPhotoPicker = () => postInputRef.current?.click();

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

        setPostActionPhase("posting");
    };

    React.useEffect(() => {
        if (!postActionPhase) return;

        const timeoutID = window.setTimeout(
            () =>
                setPostActionPhase(
                    postActionPhase == "posting" ? "posted" : null,
                ),
            postActionPhase == "posting"
                ? socialActionBusyDurationMs
                : socialActionDoneDurationMs,
        );
        return () => window.clearTimeout(timeoutID);
    }, [postActionPhase]);

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
                    "@media (min-width: 600px)": { maxWidth: 375 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gridTemplateColumns: "32px 1fr 32px",
                        p: 2,
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
                        aria-label="Open profile"
                        onClick={onOpenProfile}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: 0,
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            height: 28,
                            justifyContent: "center",
                            justifySelf: "flex-start",
                            lineHeight: 0,
                            placeSelf: "center start",
                            overflow: "hidden",
                            p: 0,
                            width: 28,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
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
                                    fontSize: 10,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                }}
                            >
                                {initials}
                            </Box>
                        )}
                    </Box>
                    <Box
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            justifySelf: "center",
                            lineHeight: 0,
                            overflow: "visible",
                            placeSelf: "center",
                            width: 58,
                            "& svg": { display: "block", overflow: "visible" },
                        }}
                    >
                        <EnteLogo height={18} />
                    </Box>
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
                            height: 32,
                            justifyContent: "center",
                            justifySelf: "flex-end",
                            lineHeight: 0,
                            opacity: 1,
                            p: 0,
                            placeSelf: "center end",
                            width: 32,
                            transition: `color ${socialActionTransition}`,
                            "& svg": { display: "block" },
                            "&:focus-visible": {
                                borderRadius: "6px",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <SocialActionFeedbackIcon
                            idleIcon={
                                <HugeiconsIcon
                                    icon={AddSquareIcon}
                                    size={28}
                                    strokeWidth={1.8}
                                />
                            }
                            phase={postActionFeedbackPhase}
                            size={28}
                        />
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
                                onOpenPhoto={setSelectedPhoto}
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
                {selectedPhoto && (
                    <SocialFileViewer
                        photo={selectedPhoto}
                        onClose={() => setSelectedPhoto(null)}
                        onOpenProfile={
                            selectedPhotoFriendID && onOpenFriend
                                ? () => {
                                      setSelectedPhoto(null);
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
