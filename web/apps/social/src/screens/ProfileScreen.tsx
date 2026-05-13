import {
    AddSquareIcon,
    ArrowLeft02Icon,
    MoreHorizontalIcon,
    Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem } from "@mui/material";
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
import { LinkIcon, ShareIcon } from "screens/ShareProfileLinkScreen";
import {
    createLocalPostPhoto,
    type LocalPostPhotoDimensions,
} from "utils/localPostPhoto";
import { profileLinkForUsername } from "utils/profileLink";
import { firstNameFrom, initialsFor } from "utils/socialDisplay";

export const profileBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textStrong = "#303030";
const textSoft = "#777777";
const coverForeground = "#FFFFFF";
const profileHeaderHeight = 56;
const profileAvatarTopOffset = 54;
const profileAvatarSize = 120;
const profileCoverHeight =
    profileHeaderHeight + profileAvatarTopOffset + profileAvatarSize / 2;
const photoMasonryGap = "3px";
const photoMasonryRadius = "12px";
const showMockProfilePosts =
    process.env.NEXT_PUBLIC_HIDE_SOCIAL_MOCK_PROFILE_POSTS != "true";
type PostActionPhase = "posting" | "posted";

interface ProfilePhotoDimensions {
    height: number;
    width: number;
}

interface SampleProfilePhoto extends ProfilePhotoDimensions {
    imageUrl: string;
}

const samplePhotos = [
    { height: 680, imageUrl: "/images/sample-feed-1.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-1.jpg",
        width: 680,
    },
    { height: 680, imageUrl: "/images/sample-feed-5.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-2.jpg",
        width: 680,
    },
    { height: 680, imageUrl: "/images/sample-feed-2.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-3.jpg",
        width: 680,
    },
    { height: 680, imageUrl: "/images/sample-feed-6.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-4.jpg",
        width: 680,
    },
    { height: 680, imageUrl: "/images/sample-feed-3.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-5.jpg",
        width: 680,
    },
    { height: 680, imageUrl: "/images/sample-feed-4.jpg", width: 900 },
    {
        height: 1020,
        imageUrl: "/images/sample-feed-portrait-6.jpg",
        width: 680,
    },
] as const satisfies readonly SampleProfilePhoto[];

const samplePostDateLabels = [
    "Today",
    "Yesterday",
    "Wed, Apr 29",
    "Tue, Apr 28",
    "Mon, Apr 27",
    "Sun, Apr 26",
    "Sat, Apr 25",
    "Fri, Apr 24",
    "Thu, Apr 23",
    "Wed, Apr 22",
];

const samplePostPhotoCounts = [4, 2, 1, 6, 10, 3, 8, 5, 7, 9];
const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);

const samplePostTimestampAt = (groupIndex: number, itemIndex: number) => {
    if (groupIndex == 0) return minutesAgo(18 + itemIndex * 12);
    if (groupIndex == 1) return hoursAgo(26 + itemIndex * 3);
    return daysAgo(groupIndex + 1) - itemIndex * 20 * 60 * 1000;
};

const samplePhotoAt = (index: number): SampleProfilePhoto =>
    samplePhotos[index % samplePhotos.length] ?? samplePhotos[0];

const photoAspectRatio = ({ height, width }: ProfilePhotoDimensions): number =>
    height > 0 && width > 0 ? width / height : 1;

const samplePostGroups = samplePostDateLabels.map((label, groupIndex) => ({
    label,
    items: Array.from(
        { length: samplePostPhotoCounts[groupIndex] ?? 1 },
        (_, itemIndex) => {
            const photo = samplePhotoAt(groupIndex + itemIndex);
            return {
                height: photo.height,
                id: `${groupIndex}-${itemIndex}`,
                imageUrl: photo.imageUrl,
                timestampMs: samplePostTimestampAt(groupIndex, itemIndex),
                width: photo.width,
            };
        },
    ),
}));

type SamplePostItem = (typeof samplePostGroups)[number]["items"][number];

interface SelectedProfilePost {
    id: string;
    localObjectUrl?: string;
    photo: SocialViewerPhoto;
    showPostCaptionInput?: boolean;
}

interface PostMasonryTile {
    aspectRatio: number;
    dimensions: ProfilePhotoDimensions;
    index: number;
    item: SamplePostItem;
}

interface PostMasonryRow {
    aspectRatio: number;
    tiles: PostMasonryTile[];
}

const buildPostMasonryRows = (
    items: SamplePostItem[],
    loadedDimensionsByURL: Record<string, ProfilePhotoDimensions>,
): PostMasonryRow[] => {
    const tiles = items.map((item, index) => {
        const dimensions = loadedDimensionsByURL[item.imageUrl] ?? item;
        return {
            aspectRatio: Math.max(0.1, photoAspectRatio(dimensions)),
            dimensions,
            index,
            item,
        };
    });
    const rows = new Array<PostMasonryRow>();
    let nextTileIndex = 0;

    while (nextTileIndex < tiles.length) {
        const rowSize = preferredPostMasonryRowSize(
            tiles.length - nextTileIndex,
        );
        const rowTiles = tiles.slice(nextTileIndex, nextTileIndex + rowSize);
        rows.push({
            aspectRatio: rowTiles.reduce(
                (aspectRatio, tile) => aspectRatio + tile.aspectRatio,
                0,
            ),
            tiles: rowTiles,
        });
        nextTileIndex += rowSize;
    }

    return rows;
};

const preferredPostMasonryRowSize = (remainingTiles: number) => {
    if (remainingTiles <= 3) return remainingTiles;
    if (remainingTiles == 4 || remainingTiles == 5) return 2;
    return remainingTiles % 2 == 0 ? 2 : 3;
};

interface ProfileScreenProps {
    friendsCount?: number;
    headerVariant?: "friend" | "owner" | "public";
    onAddFriend?: () => void;
    onBack?: () => void;
    onOpenFriend?: (friendID: string) => void;
    onOpenFriends?: () => void;
    onOpenSettings?: () => void;
    profile: SetupProfile;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
    friendsCount = 7,
    headerVariant = "owner",
    onAddFriend,
    onBack,
    onOpenFriend,
    onOpenFriends,
    onOpenSettings,
    profile,
}) => {
    const [profileActionsAnchor, setProfileActionsAnchor] =
        useState<HTMLElement | null>(null);
    const [selectedPost, setSelectedPost] =
        useState<SelectedProfilePost | null>(null);
    const [postActionPhase, setPostActionPhase] =
        useState<PostActionPhase | null>(null);
    const [deletedPostIDs, setDeletedPostIDs] = useState<Set<string>>(
        () => new Set(),
    );
    const [loadedPhotoDimensionsByURL, setLoadedPhotoDimensionsByURL] =
        useState<Record<string, ProfilePhotoDimensions>>({});
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const localPostObjectUrlsRef = React.useRef<Set<string>>(new Set());
    const pendingPostRef = React.useRef<SelectedProfilePost | null>(null);
    const isPublicProfile = headerVariant == "public";
    const isOwnerProfile = headerVariant == "owner";
    const isFriendProfile = headerVariant == "friend";
    const displayName = profile.fullName.trim() || profile.username.trim();
    const profileLink = profileLinkForUsername(profile.username.trim());
    const firstName = firstNameFrom(displayName);
    const initialsSource = displayName || profile.username.trim();
    const initials = initialsFor(initialsSource);
    const visiblePostGroups = (showMockProfilePosts ? samplePostGroups : [])
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => !deletedPostIDs.has(item.id)),
        }))
        .filter((group) => group.items.length > 0);
    const postsSharedCount = visiblePostGroups.reduce(
        (count, group) => count + group.items.length,
        0,
    );
    const isProfileActionsOpen = Boolean(profileActionsAnchor);
    const canOpenFriends =
        isOwnerProfile && friendsCount > 0 && Boolean(onOpenFriends);
    const hasProfilePosts = postsSharedCount > 0;
    const isPostActionPosting = postActionPhase == "posting";
    const isPostActionPosted = postActionPhase == "posted";
    const postActionFeedbackPhase: SocialActionPhase | null =
        postActionPhase == "posting"
            ? "busy"
            : postActionPhase == "posted"
              ? "done"
              : null;

    const closeProfileActions = () => setProfileActionsAnchor(null);
    const revokeLocalPostObjectUrl = React.useCallback((objectUrl?: string) => {
        if (!objectUrl || !localPostObjectUrlsRef.current.has(objectUrl))
            return;

        URL.revokeObjectURL(objectUrl);
        localPostObjectUrlsRef.current.delete(objectUrl);
    }, []);
    const applyLocalPostDimensions = React.useCallback(
        (objectUrl: string, dimensions: LocalPostPhotoDimensions) => {
            const pendingPost = pendingPostRef.current;
            if (pendingPost?.localObjectUrl == objectUrl) {
                pendingPostRef.current = {
                    ...pendingPost,
                    photo: { ...pendingPost.photo, ...dimensions },
                };
            }

            setSelectedPost((currentPost) =>
                currentPost?.localObjectUrl == objectUrl
                    ? {
                          ...currentPost,
                          photo: { ...currentPost.photo, ...dimensions },
                      }
                    : currentPost,
            );
        },
        [],
    );
    const openPostPhotoPicker = () => postInputRef.current?.click();
    const closeSelectedPost = () => {
        const localObjectUrl = selectedPost?.localObjectUrl;
        setSelectedPost(null);
        revokeLocalPostObjectUrl(localObjectUrl);
    };
    const rememberLoadedPhotoDimensions = (
        imageUrl: string,
        image: HTMLImageElement,
    ) => {
        const { naturalHeight, naturalWidth } = image;
        if (naturalHeight <= 0 || naturalWidth <= 0) return;

        setLoadedPhotoDimensionsByURL((currentDimensions) => {
            const current = currentDimensions[imageUrl];
            if (
                current?.height == naturalHeight &&
                current.width == naturalWidth
            )
                return currentDimensions;

            return {
                ...currentDimensions,
                [imageUrl]: { height: naturalHeight, width: naturalWidth },
            };
        });
    };

    const handlePostPhotoSelect: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        revokeLocalPostObjectUrl(pendingPostRef.current?.localObjectUrl);
        pendingPostRef.current = null;

        const localPost = createLocalPostPhoto({
            avatarUrl: profile.avatarUrl,
            file,
            name: displayName || "You",
            onDimensionsLoaded: applyLocalPostDimensions,
        });
        localPostObjectUrlsRef.current.add(localPost.objectUrl);
        pendingPostRef.current = {
            id: `local-${localPost.photo.timestampMs}`,
            localObjectUrl: localPost.objectUrl,
            photo: localPost.photo,
            showPostCaptionInput: true,
        };

        setPostActionPhase("posting");
    };

    const copyProfileURL = async () => {
        closeProfileActions();
        await navigator.clipboard.writeText(profileLink);
    };

    const shareProfile = async () => {
        closeProfileActions();

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

    const deleteSelectedPost = () => {
        if (!selectedPost) return;

        setDeletedPostIDs((currentPostIDs) => {
            const nextPostIDs = new Set(currentPostIDs);
            nextPostIDs.add(selectedPost.id);
            return nextPostIDs;
        });
    };

    React.useEffect(() => {
        if (!postActionPhase) return;

        const timeoutID = window.setTimeout(
            () => {
                if (postActionPhase == "posting") {
                    setPostActionPhase("posted");
                    return;
                }

                const postedPost = pendingPostRef.current;
                pendingPostRef.current = null;
                if (postedPost) setSelectedPost(postedPost);
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
                bgcolor: profileBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: profileBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100svh",
                    mx: "auto",
                    overflow: "hidden",
                    position: "relative",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                {isOwnerProfile && (
                    <Box
                        ref={postInputRef}
                        component="input"
                        type="file"
                        accept="image/*"
                        onChange={handlePostPhotoSelect}
                        sx={{ display: "none" }}
                    />
                )}
                <Box
                    className="green-bg"
                    sx={{
                        height: profileCoverHeight,
                        insetInline: 0,
                        position: "absolute",
                        top: 0,
                        width: "100%",
                        zIndex: 0,
                        "@media (min-width: 600px)": {
                            borderBottomLeftRadius: photoMasonryRadius,
                            borderBottomRightRadius: photoMasonryRadius,
                        },
                    }}
                />
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        color: coverForeground,
                        display: "grid",
                        gridTemplateColumns: isPublicProfile
                            ? "1fr auto"
                            : "24px 1fr 24px",
                        height: profileHeaderHeight,
                        position: "relative",
                        px: 2,
                        py: 0,
                        width: "100%",
                        zIndex: 1,
                    }}
                >
                    {isPublicProfile ? (
                        <Box
                            component="a"
                            href="https://ente.com/"
                            aria-label="Go to ente.com"
                            sx={{
                                alignSelf: "center",
                                color: "inherit",
                                cursor: "pointer",
                                justifySelf: "flex-start",
                                lineHeight: 0,
                                overflow: "visible",
                                textDecoration: "none",
                                width: 58,
                                "&:focus-visible": {
                                    borderRadius: "4px",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 3,
                                },
                                "& svg": {
                                    display: "block",
                                    overflow: "visible",
                                },
                            }}
                        >
                            <EnteLogo height={18} />
                        </Box>
                    ) : (
                        <Box
                            component="button"
                            type="button"
                            aria-label={
                                isFriendProfile
                                    ? "Back to friends"
                                    : "Back to home"
                            }
                            onClick={onBack}
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                color: "inherit",
                                cursor: "pointer",
                                display: "flex",
                                height: 24,
                                justifyContent: "flex-start",
                                ml: "-2px",
                                p: 0,
                                width: 24,
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={ArrowLeft02Icon}
                                size={24}
                                strokeWidth={1.8}
                            />
                        </Box>
                    )}
                    {isPublicProfile && (
                        <Box
                            component="button"
                            type="button"
                            onClick={onAddFriend}
                            sx={{
                                alignItems: "center",
                                backgroundColor: "#FFFFFF",
                                border: 0,
                                borderRadius: "999px",
                                color: green,
                                cursor: onAddFriend ? "pointer" : "default",
                                display: "inline-flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 700,
                                height: 36,
                                justifyContent: "center",
                                justifySelf: "flex-end",
                                lineHeight: "18px",
                                minWidth: 0,
                                paddingInline: "16px",
                                whiteSpace: "nowrap",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { backgroundColor: "#F3FFF5" },
                            }}
                        >
                            Add friend
                        </Box>
                    )}
                    {!isPublicProfile && (
                        <Box
                            component="h1"
                            sx={{
                                color: "inherit",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 18,
                                fontWeight: 700,
                                justifySelf: "center",
                                lineHeight: "24px",
                                m: 0,
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {profile.username}
                        </Box>
                    )}
                    {isOwnerProfile ? (
                        <Box
                            component="button"
                            type="button"
                            aria-label="Settings"
                            onClick={onOpenSettings}
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                color: "inherit",
                                cursor: onOpenSettings ? "pointer" : "default",
                                display: "flex",
                                height: 24,
                                justifyContent: "flex-end",
                                p: 0,
                                width: 24,
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Settings01Icon}
                                size={19}
                                strokeWidth={1.8}
                            />
                        </Box>
                    ) : (
                        !isPublicProfile && (
                            <Box aria-hidden sx={{ width: 24 }} />
                        )
                    )}
                </Box>
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        px: "16px",
                        position: "relative",
                        pt: `${profileAvatarTopOffset}px`,
                        textAlign: "center",
                        width: "100%",
                        zIndex: 1,
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            aspectRatio: "1 / 1",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: "4px solid #FFFFFF",
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            color: green,
                            display: "flex",
                            justifyContent: "center",
                            overflow: "hidden",
                            width: profileAvatarSize,
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
                                    fontSize: 38,
                                    fontWeight: 800,
                                    lineHeight: 1,
                                }}
                            >
                                {initials}
                            </Box>
                        )}
                    </Box>
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            mt: "14px",
                            minWidth: 0,
                            width: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "grid",
                                gridTemplateColumns:
                                    "minmax(0, 1fr) minmax(0, max-content) minmax(0, 1fr)",
                                minWidth: 0,
                                width: "100%",
                            }}
                        >
                            <Box
                                sx={{
                                    color: textStrong,
                                    fontFamily:
                                        '"Nunito", "Inter Variable", sans-serif',
                                    fontSize: 26,
                                    fontWeight: 800,
                                    gridColumn: 2,
                                    lineHeight: "32px",
                                    maxWidth: isPublicProfile
                                        ? "100%"
                                        : "calc(100vw - 72px)",
                                    "@media (min-width: 600px)": {
                                        maxWidth: isPublicProfile
                                            ? "100%"
                                            : 303,
                                    },
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {displayName}
                            </Box>
                            {isOwnerProfile && (
                                <Box
                                    component="button"
                                    id="profile-actions-button"
                                    type="button"
                                    aria-label="Profile actions"
                                    aria-controls={
                                        isProfileActionsOpen
                                            ? "profile-actions-menu"
                                            : undefined
                                    }
                                    aria-expanded={
                                        isProfileActionsOpen
                                            ? "true"
                                            : undefined
                                    }
                                    aria-haspopup="menu"
                                    onClick={(event) =>
                                        setProfileActionsAnchor(
                                            event.currentTarget,
                                        )
                                    }
                                    sx={{
                                        alignItems: "center",
                                        bgcolor: "transparent",
                                        border: 0,
                                        color: textStrong,
                                        cursor: "pointer",
                                        display: "flex",
                                        gridColumn: 3,
                                        height: 24,
                                        justifyContent: "center",
                                        justifySelf: "start",
                                        ml: "4px",
                                        p: 0,
                                        width: 24,
                                        "&:focus-visible": {
                                            borderRadius: "50%",
                                            outline: `2px solid ${green}`,
                                            outlineOffset: 2,
                                        },
                                    }}
                                >
                                    <HugeiconsIcon
                                        icon={MoreHorizontalIcon}
                                        size={20}
                                        strokeWidth={2}
                                    />
                                </Box>
                            )}
                        </Box>
                        {isOwnerProfile && (
                            <Menu
                                id="profile-actions-menu"
                                anchorEl={profileActionsAnchor}
                                open={isProfileActionsOpen}
                                onClose={closeProfileActions}
                                anchorOrigin={{
                                    horizontal: "center",
                                    vertical: "bottom",
                                }}
                                transformOrigin={{
                                    horizontal: "center",
                                    vertical: "top",
                                }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            borderRadius: "16px",
                                            boxShadow:
                                                "0 14px 40px rgba(0, 0, 0, 0.16)",
                                            mt: "6px",
                                            minWidth: 0,
                                            p: "4px",
                                            width: "max-content",
                                        },
                                    },
                                    list: {
                                        "aria-labelledby":
                                            "profile-actions-button",
                                        sx: { p: 0 },
                                    },
                                }}
                            >
                                <MenuItem
                                    disableRipple
                                    onClick={() => void copyProfileURL()}
                                    sx={{
                                        borderRadius: "10px",
                                        gap: "8px",
                                        minHeight: 38,
                                        px: "8px",
                                        py: "7px",
                                        whiteSpace: "nowrap",
                                        "&.Mui-focusVisible": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&.Mui-selected": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&.Mui-selected:hover": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&:active": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&:hover": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            alignItems: "center",
                                            color: textBase,
                                            display: "flex",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <LinkIcon />
                                    </Box>
                                    <Box
                                        sx={{
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            lineHeight: "18px",
                                        }}
                                    >
                                        Copy profile URL
                                    </Box>
                                </MenuItem>
                                <MenuItem
                                    disableRipple
                                    onClick={() => void shareProfile()}
                                    sx={{
                                        borderRadius: "10px",
                                        gap: "8px",
                                        minHeight: 38,
                                        px: "8px",
                                        py: "7px",
                                        whiteSpace: "nowrap",
                                        "&.Mui-focusVisible": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&.Mui-selected": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&.Mui-selected:hover": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&:active": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                        "&:hover": {
                                            bgcolor: "rgba(0, 0, 0, 0.025)",
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            alignItems: "center",
                                            color: textBase,
                                            display: "flex",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <ShareIcon />
                                    </Box>
                                    <Box
                                        sx={{
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            lineHeight: "18px",
                                        }}
                                    >
                                        Share profile
                                    </Box>
                                </MenuItem>
                            </Menu>
                        )}
                        <Box
                            sx={{
                                color: textSoft,
                                display: "flex",
                                gap: "5px",
                                alignItems: "baseline",
                                flexWrap: "wrap",
                                justifyContent: "center",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 600,
                                lineHeight: "20px",
                                mt: "2px",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <Box component="span" sx={{ color: textBase }}>
                                {postsSharedCount}
                            </Box>
                            <Box component="span">posts</Box>
                            <Box component="span">·</Box>
                            <Box
                                component={canOpenFriends ? "button" : "span"}
                                type={canOpenFriends ? "button" : undefined}
                                aria-label={
                                    canOpenFriends ? "Open friends" : undefined
                                }
                                onClick={
                                    canOpenFriends ? onOpenFriends : undefined
                                }
                                sx={{
                                    alignItems: "baseline",
                                    bgcolor: "transparent",
                                    border: 0,
                                    color: "inherit",
                                    cursor: canOpenFriends
                                        ? "pointer"
                                        : "default",
                                    display: "inline-flex",
                                    gap: "5px",
                                    font: "inherit",
                                    lineHeight: "inherit",
                                    p: 0,
                                    "&:focus-visible": {
                                        borderRadius: "6px",
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 2,
                                    },
                                }}
                            >
                                <Box component="span" sx={{ color: textBase }}>
                                    {friendsCount}
                                </Box>
                                <Box component="span">friends</Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
                <Box
                    component="section"
                    sx={{
                        alignItems: "stretch",
                        boxSizing: "border-box",
                        display: "flex",
                        flex: hasProfilePosts ? "0 0 auto" : "1 1 0",
                        flexDirection: "column",
                        gap: "24px",
                        minHeight: hasProfilePosts ? undefined : 0,
                        mt: "24px",
                        pb: "16px",
                        px: 0,
                        width: "100%",
                    }}
                >
                    {hasProfilePosts ? (
                        visiblePostGroups.map((group) => {
                            const masonryRows = buildPostMasonryRows(
                                group.items,
                                loadedPhotoDimensionsByURL,
                            );

                            return (
                                <Box
                                    component="section"
                                    key={group.label}
                                    sx={{ width: "100%" }}
                                >
                                    <Box
                                        sx={{
                                            mb: "10px",
                                            px: "18px",
                                            width: "100%",
                                        }}
                                    >
                                        <Box
                                            component="h2"
                                            sx={{
                                                color: textStrong,
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: 14,
                                                fontWeight: 650,
                                                letterSpacing: 0,
                                                lineHeight: "20px",
                                                m: 0,
                                            }}
                                        >
                                            {group.label}
                                        </Box>
                                    </Box>
                                    <Box
                                        sx={{
                                            borderRadius: photoMasonryRadius,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: photoMasonryGap,
                                            mx: "16px",
                                            overflow: "hidden",
                                            width: "calc(100% - 32px)",
                                        }}
                                    >
                                        {masonryRows.map((row, rowIndex) => (
                                            <Box
                                                key={`${group.label}-row-${rowIndex}`}
                                                sx={{
                                                    display: "flex",
                                                    gap: photoMasonryGap,
                                                    aspectRatio: `${row.aspectRatio} / 1`,
                                                    width: "100%",
                                                }}
                                            >
                                                {row.tiles.map(
                                                    ({
                                                        aspectRatio,
                                                        dimensions,
                                                        item,
                                                        index,
                                                    }) => (
                                                        <Box
                                                            component="button"
                                                            type="button"
                                                            aria-label={`Open ${displayName} post ${
                                                                index + 1
                                                            }`}
                                                            onClick={() =>
                                                                setSelectedPost(
                                                                    {
                                                                        id: item.id,
                                                                        photo: {
                                                                            alt: `${displayName} post ${
                                                                                index +
                                                                                1
                                                                            }`,
                                                                            avatarUrl:
                                                                                profile.avatarUrl,
                                                                            height: dimensions.height,
                                                                            imageUrl:
                                                                                item.imageUrl,
                                                                            name: displayName,
                                                                            timestampMs:
                                                                                item.timestampMs,
                                                                            width: dimensions.width,
                                                                        },
                                                                    },
                                                                )
                                                            }
                                                            key={`${group.label}-${item.imageUrl}-${index}`}
                                                            sx={{
                                                                appearance:
                                                                    "none",
                                                                bgcolor:
                                                                    paleGreen,
                                                                border: 0,
                                                                cursor: "pointer",
                                                                display:
                                                                    "block",
                                                                flex: `${aspectRatio} 1 0`,
                                                                height: "100%",
                                                                minWidth: 0,
                                                                overflow:
                                                                    "hidden",
                                                                p: 0,
                                                                "&:focus-visible":
                                                                    {
                                                                        outline: `2px solid ${green}`,
                                                                        outlineOffset:
                                                                            -2,
                                                                    },
                                                            }}
                                                        >
                                                            <Box
                                                                component="img"
                                                                alt={`${group.label} post ${
                                                                    index + 1
                                                                }`}
                                                                onLoad={(
                                                                    event,
                                                                ) =>
                                                                    rememberLoadedPhotoDimensions(
                                                                        item.imageUrl,
                                                                        event.currentTarget,
                                                                    )
                                                                }
                                                                src={
                                                                    item.imageUrl
                                                                }
                                                                sx={{
                                                                    display:
                                                                        "block",
                                                                    height: "100%",
                                                                    objectFit:
                                                                        "cover",
                                                                    objectPosition:
                                                                        "center",
                                                                    width: "100%",
                                                                }}
                                                            />
                                                        </Box>
                                                    ),
                                                )}
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            );
                        })
                    ) : (
                        <Box
                            sx={{
                                alignItems: "center",
                                boxSizing: "border-box",
                                display: "flex",
                                flex: 1,
                                flexDirection: "column",
                                justifyContent: "center",
                                minHeight: 0,
                                pb: "12px",
                                px: 3,
                                textAlign: "center",
                                width: "100%",
                            }}
                        >
                            {isOwnerProfile && (
                                <Box
                                    component="img"
                                    alt=""
                                    src="/images/ducky-camera.svg"
                                    sx={{
                                        display: "block",
                                        height: "auto",
                                        width: 128,
                                    }}
                                />
                            )}
                            <Box
                                component="p"
                                sx={{
                                    color: textSoft,
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    m: 0,
                                    mt: isOwnerProfile ? "28px" : 0,
                                    maxWidth: isOwnerProfile ? 230 : 250,
                                }}
                            >
                                {isOwnerProfile
                                    ? "Your profile is looking empty. Share something with your friends."
                                    : `${firstName} hasn't posted anything yet.`}
                            </Box>
                            {isOwnerProfile && (
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
                                        color: isPostActionPosted
                                            ? green
                                            : textBase,
                                        cursor:
                                            postActionPhase == null
                                                ? "pointer"
                                                : "default",
                                        display: "flex",
                                        fontSize: 0,
                                        height: 32,
                                        justifyContent: "center",
                                        lineHeight: 0,
                                        mt: "20px",
                                        p: 0,
                                        placeSelf: "center",
                                        placeItems: "center",
                                        transition: `color ${socialActionTransition}`,
                                        width: 32,
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
                            )}
                        </Box>
                    )}
                </Box>
                {selectedPost && (
                    <SocialFileViewer
                        currentUser={{
                            avatarUrl: profile.avatarUrl,
                            name: displayName,
                        }}
                        photo={selectedPost.photo}
                        showPostCaptionInput={selectedPost.showPostCaptionInput}
                        onClose={closeSelectedPost}
                        onDeletePost={
                            isOwnerProfile ? deleteSelectedPost : undefined
                        }
                        onOpenFriend={
                            onOpenFriend
                                ? (friendID) => {
                                      closeSelectedPost();
                                      onOpenFriend(friendID);
                                  }
                                : undefined
                        }
                        onOpenProfile={closeSelectedPost}
                    />
                )}
            </Box>
        </Box>
    );
};
