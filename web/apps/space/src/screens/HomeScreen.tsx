import {
    AddSquareIcon,
    FavouriteIcon,
    MultiplicationSignIcon,
    Notification01Icon,
    UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SpaceFileViewer,
    type SpaceLiker,
    type SpaceViewerInitialScreen,
    type SpaceViewerPhoto,
    type SpaceViewerPostActionMode,
} from "components/SpaceFileViewer";
import { SpaceLoadingSpinner } from "components/SpaceRouteFallback";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import type { SpacePost } from "services/space";
import { createLocalPostPhoto } from "utils/localPostPhoto";
import {
    firstNameFrom,
    formatSpaceDate,
    initialsFor,
} from "utils/spaceDisplay";
import {
    prepareSpacePostImage,
    spacePostImageErrorMessage,
    spacePostImageInputAccept,
    type PreparedSpacePostImage,
} from "utils/spacePostImage";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const feedCardBackground = "#F5F5F5";
const textBase = "#000";
const textSecondary = "#6B6B6B";
const warning = "#F63A3A";
const feedAvatarSize = 26;
const headerActionSize = 32;
const headerActionGap = 8;
const headerAddIconSize = 24;
const headerAvatarSize = 23;
const headerIconSize = 23;
const headerSideWidth = headerActionSize * 2 + headerActionGap;
const feedLikeActionSize = 28;
const feedActionIconSize = 20;
const feedReplyIconSize = 17;
const emptyFeedItemGap = "22px";

const FeedReplyIcon: React.FC = () => (
    <svg
        width={feedReplyIconSize}
        height={feedReplyIconSize}
        viewBox="0 0 12 9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4.5241 0.242677C4.62341 0.34442 4.67919 0.482337 4.67919 0.626134C4.67919 0.76993 4.62341 0.907847 4.5241 1.00959L1.89369 3.70102H7.68483C8.3587 3.70102 9.35854 3.9036 10.2042 4.52653C11.0775 5.17045 11.7507 6.23762 11.7507 7.86116C11.7507 8.00507 11.6948 8.14309 11.5953 8.24485C11.4959 8.34661 11.361 8.40378 11.2203 8.40378C11.0797 8.40378 10.9448 8.34661 10.8453 8.24485C10.7459 8.14309 10.69 8.00507 10.69 7.86116C10.69 6.59069 10.1844 5.84982 9.58481 5.40776C8.95761 4.94544 8.18899 4.78627 7.68483 4.78627H1.89369L4.5241 7.4777C4.5762 7.52738 4.61799 7.58728 4.64698 7.65384C4.67597 7.72041 4.69155 7.79226 4.69281 7.86512C4.69406 7.93798 4.68096 8.01035 4.65429 8.07791C4.62762 8.14548 4.58792 8.20686 4.53756 8.25839C4.4872 8.30991 4.42722 8.35053 4.36118 8.37782C4.29515 8.40512 4.22442 8.41852 4.15321 8.41723C4.082 8.41595 4.01178 8.4 3.94673 8.37034C3.88167 8.34068 3.82313 8.29792 3.77457 8.24461L0.23908 4.6271C0.139767 4.52536 0.0839844 4.38744 0.0839844 4.24364C0.0839844 4.09985 0.139767 3.96193 0.23908 3.86019L3.77457 0.242677C3.87401 0.141061 4.0088 0.0839844 4.14934 0.0839844C4.28987 0.0839844 4.42466 0.141061 4.5241 0.242677Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.166667"
        />
    </svg>
);

interface HomeScreenProps {
    addedFriendToastName?: string;
    feedItems: SpacePost[];
    friendsCount: number;
    hasUnreadNotifications?: boolean;
    isFeedLoading?: boolean;
    onAddedFriendToastClose?: () => void;
    onCreatePost?: (
        image: PreparedSpacePostImage,
        caption: string,
    ) => Promise<SpaceViewerPhoto>;
    onOpenFriend?: (friendID: string) => void;
    onOpenNotifications?: () => void;
    onOpenProfile?: () => void;
    onLoadPostLikers?: (postId: number) => Promise<SpaceLiker[]>;
    onReplyToPost?: (postId: number, text: string) => Promise<void>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    onShareProfileLink?: () => Promise<string>;
    profile: SetupProfile;
}

interface FeedPhotoDimensions {
    height: number;
    width: number;
}

interface SelectedHomeViewer {
    draftImage?: PreparedSpacePostImage;
    focusReplyOnOpen?: boolean;
    initialScreen: SpaceViewerInitialScreen;
    localObjectUrl?: string;
    photo: SpaceViewerPhoto;
    postActionMode?: SpaceViewerPostActionMode;
}

interface FeedItemProps {
    aspectRatio: number;
    avatarUrl?: string | null;
    caption?: string;
    friendID: string;
    imageUrl: string;
    likeCount: number;
    name: string;
    onOpenFriend?: (friendID: string) => void;
    onOpenPhoto?: (
        photo: SpaceViewerPhoto,
        initialScreen?: SpaceViewerInitialScreen,
        focusReplyOnOpen?: boolean,
    ) => void;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    postId: number;
    timestampMs: number;
    viewerLiked: boolean;
    viewerUnread: boolean;
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
    caption,
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
    viewerUnread,
}) => {
    const [isLiked, setIsLiked] = useState(viewerLiked);
    const [localLikeCount, setLocalLikeCount] = useState(likeCount);
    const firstName = firstNameFrom(name);
    const dateLabel = formatSpaceDate(timestampMs);
    const displayCaption = caption?.trim();
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
    const openPhoto = (
        initialScreen?: SpaceViewerInitialScreen,
        focusReplyOnOpen = false,
    ) =>
        onOpenPhoto?.(
            {
                alt: `${name} post`,
                avatarUrl,
                caption,
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
            focusReplyOnOpen,
        );
    const handleLikeClick = () => {
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
    };

    React.useEffect(() => {
        setIsLiked(viewerLiked);
    }, [viewerLiked]);

    React.useEffect(() => {
        setLocalLikeCount(likeCount);
    }, [likeCount]);

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
                    gridTemplateColumns: `${feedAvatarSize}px minmax(0, 1fr) auto${viewerUnread ? " 8px" : ""}`,
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
                {viewerUnread && (
                    <Box
                        aria-hidden
                        sx={{
                            bgcolor: green,
                            borderRadius: "50%",
                            height: 8,
                            justifySelf: "end",
                            width: 8,
                        }}
                    />
                )}
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
            </Box>
            <Box
                sx={{
                    alignItems: "center",
                    boxSizing: "border-box",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    minHeight: feedLikeActionSize,
                    mt: "8px",
                    pl: "4px",
                    pr: 0,
                    width: "100%",
                }}
            >
                <Box
                    component="p"
                    title={displayCaption || undefined}
                    sx={{
                        color: textBase,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: "18px",
                        m: 0,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {displayCaption || ""}
                </Box>
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "8px",
                        justifyContent: "flex-end",
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label={`Reply to ${firstName}'s post`}
                        onClick={() => openPhoto("photo", true)}
                        sx={{
                            alignItems: "center",
                            appearance: "none",
                            bgcolor: "transparent",
                            border: 0,
                            borderRadius: "50%",
                            color: textBase,
                            cursor: "pointer",
                            display: "inline-flex",
                            height: feedLikeActionSize,
                            justifyContent: "center",
                            p: 0,
                            flexShrink: 0,
                            transition:
                                "color 120ms ease, transform 120ms ease",
                            width: feedLikeActionSize,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                            "&:hover": { bgcolor: "transparent" },
                        }}
                    >
                        <FeedReplyIcon />
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
                            color: textBase,
                            cursor: "pointer",
                            display: "inline-flex",
                            flexShrink: 0,
                            height: feedLikeActionSize,
                            justifyContent: "center",
                            p: 0,
                            transition: "color 120ms ease",
                            width: feedLikeActionSize,
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
                            primaryColor={isLiked ? green : textBase}
                            size={feedActionIconSize}
                            strokeWidth={1.8}
                        />
                    </Box>
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
    hasUnreadNotifications = false,
    isFeedLoading = false,
    onAddedFriendToastClose,
    onCreatePost,
    onLoadPostLikers,
    onOpenFriend,
    onOpenNotifications,
    onOpenProfile,
    onReplyToPost,
    onSetPostLiked,
    onShareProfileLink,
    profile,
}) => {
    const [selectedViewer, setSelectedViewer] =
        useState<SelectedHomeViewer | null>(null);
    const [postPhotoError, setPostPhotoError] = useState<string>();
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
    const openPostPhotoPicker = () => postInputRef.current?.click();
    const openFeedPhoto = (
        photo: SpaceViewerPhoto,
        initialScreen: SpaceViewerInitialScreen = "photo",
        focusReplyOnOpen = false,
    ) => {
        setSelectedViewer({
            focusReplyOnOpen,
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

    const prepareSelectedPostPhoto = async (file: File) => {
        const image = await prepareSpacePostImage(file);
        const localPost = createLocalPostPhoto({
            avatarUrl: profile.avatarUrl,
            dimensions: image,
            file: image.file,
            name: initialsSource || "You",
        });
        localPostObjectUrlsRef.current.add(localPost.objectUrl);
        setSelectedViewer({
            draftImage: image,
            initialScreen: "photo",
            localObjectUrl: localPost.objectUrl,
            photo: localPost.photo,
            postActionMode: "draft-post",
        });
        setPostPhotoError(undefined);
    };

    const handlePostPhotoSelect: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setPostPhotoError(undefined);
        void prepareSelectedPostPhoto(file).catch((error: unknown) => {
            console.error("Failed to prepare post photo", error);
            setPostPhotoError(spacePostImageErrorMessage(error));
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
                        accept={spacePostImageInputAccept}
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
                            aria-label={
                                hasUnreadNotifications
                                    ? "Open notifications with unread activity"
                                    : "Open notifications"
                            }
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
                            <HugeiconsIcon
                                icon={Notification01Icon}
                                size={headerIconSize}
                                strokeWidth={1.8}
                            />
                            {hasUnreadNotifications && (
                                <Box
                                    aria-hidden
                                    sx={{
                                        bgcolor: green,
                                        border: `2px solid ${homeBackground}`,
                                        borderRadius: "50%",
                                        height: 11,
                                        position: "absolute",
                                        right: 4,
                                        top: 6,
                                        width: 11,
                                    }}
                                />
                            )}
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
                {postPhotoError && (
                    <Box
                        role="alert"
                        sx={{
                            color: warning,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: "18px",
                            mt: "-8px",
                            px: 2,
                            pb: "12px",
                            textAlign: "center",
                        }}
                    >
                        {postPhotoError}
                    </Box>
                )}
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
                                caption={item.caption}
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
                                viewerUnread={item.viewerUnread}
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
                            <SpaceLoadingSpinner ariaLabel="Loading posts" />
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
                    <SpaceFileViewer
                        initialScreen={selectedViewer.initialScreen}
                        focusReplyOnOpen={selectedViewer.focusReplyOnOpen}
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
                        onReplyToPost={
                            selectedViewer.photo.friendID != profile.spaceId
                                ? onReplyToPost
                                : undefined
                        }
                        onPublishDraftPost={
                            selectedViewer.draftImage && onCreatePost
                                ? async (caption) => {
                                      const localObjectUrl =
                                          selectedViewer.localObjectUrl;
                                      const post = await onCreatePost(
                                          selectedViewer.draftImage!,
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
