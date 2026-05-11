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
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { profileLinkForUsername } from "utils/profileLink";
import { firstNameFrom, formatSocialDate } from "utils/socialDisplay";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textSecondary = "#6B6B6B";

const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);
const sampleFeedPhotoAspectRatio = 900 / 680;
const showMockFeedData =
    process.env.NEXT_PUBLIC_SHOW_SOCIAL_MOCK_FEED == "true";
type PostActionPhase = "posting" | "posted";

const sampleFeedItems = [
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-1.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: minutesAgo(22),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Mira Sen",
        timestampMs: hoursAgo(3),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        imageUrl: "/images/sample-feed-3.jpg",
        name: "Nikhil Rao",
        timestampMs: daysAgo(1),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        friendID: "riya-kapoor",
        imageUrl: "/images/sample-feed-4.jpg",
        name: "Riya Kapoor",
        timestampMs: daysAgo(2),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        friendID: "aparna-bhatnagar",
        imageUrl: "/images/sample-feed-5.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(4),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        imageUrl: "/images/sample-feed-6.jpg",
        name: "Mira Sen",
        timestampMs: daysAgo(8),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
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

const PlusIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="4 4 16 16"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
    >
        <path
            d="M12 5V19M5 12H19"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
    </Box>
);

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

    return (
        <Box
            component="article"
            sx={{ display: "flex", flexDirection: "column", width: "100%" }}
        >
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    gap: "10px",
                    mb: "10px",
                    minHeight: 32,
                    px: "20px",
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
                    sx={{
                        alignItems: "baseline",
                        color: textBase,
                        display: "flex",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        gap: "4px",
                        lineHeight: "20px",
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                    }}
                >
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
                        component="span"
                        aria-hidden
                        sx={{
                            color: textSecondary,
                            flexShrink: 0,
                            fontWeight: 500,
                        }}
                    >
                        ·
                    </Box>
                    <Box
                        component="time"
                        dateTime={new Date(timestampMs).toISOString()}
                        sx={{
                            color: textSecondary,
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 500,
                        }}
                    >
                        {dateLabel}
                    </Box>
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
                        imageUrl,
                        name,
                        timestampMs,
                    })
                }
                sx={{
                    appearance: "none",
                    aspectRatio,
                    bgcolor: paleGreen,
                    border: 0,
                    borderRadius: "20px",
                    display: "block",
                    cursor: onOpenPhoto ? "pointer" : "default",
                    mx: "16px",
                    overflow: "hidden",
                    p: 0,
                    width: "calc(100% - 32px)",
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
                        gridTemplateColumns: "24px 1fr 24px",
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
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: isPostActionPosted ? green : textBase,
                            cursor:
                                postActionPhase == null ? "pointer" : "default",
                            display: "flex",
                            height: 24,
                            justifyContent: "flex-start",
                            opacity: 1,
                            p: 0,
                            width: 24,
                            transition: `color ${socialActionTransition}`,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <SocialActionFeedbackIcon
                            idleIcon={<PlusIcon />}
                            phase={postActionFeedbackPhase}
                        />
                    </Box>
                    <Box
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            justifySelf: "center",
                            lineHeight: 0,
                            overflow: "visible",
                            width: 58,
                            "& svg": { display: "block", overflow: "visible" },
                        }}
                    >
                        <EnteLogo height={18} />
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label="Open profile"
                        onClick={onOpenProfile}
                        sx={{
                            alignItems: "center",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: 0,
                            borderRadius: "50%",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            height: 24,
                            justifyContent: "center",
                            justifySelf: "flex-end",
                            overflow: "hidden",
                            p: 0,
                            width: 24,
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
                </Box>
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: hasFeedItems ? "36px" : 0,
                        justifyContent: hasFeedItems ? "flex-start" : "center",
                        minHeight: "calc(100svh - 56px)",
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
                                    "@media (max-width: 340px)": {
                                        width: 140,
                                    },
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
