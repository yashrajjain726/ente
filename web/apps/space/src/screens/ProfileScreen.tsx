import {
    AddSquareIcon,
    ArrowLeft02Icon,
    Menu01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SpaceFileViewer,
    type SpaceLiker,
    type SpaceViewerPhoto,
    type SpaceViewerPostActionMode,
} from "components/SpaceFileViewer";
import { SpaceLoadingSpinner } from "components/SpaceRouteFallback";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import {
    createLoadedLocalPostPhoto,
    createLocalPostPhoto,
} from "utils/localPostPhoto";
import { firstNameFrom, initialsFor } from "utils/spaceDisplay";
import {
    canPreviewSpaceImageFile,
    prepareSpacePostImage,
    spacePostImageErrorMessage,
    spacePostImageInputAccept,
    type PreparedSpacePostImage,
} from "utils/spacePostImage";

export const profileBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textStrong = "#303030";
const textSoft = "#777777";
const coverForeground = "#FFFFFF";
const coverForegroundShadow = "0 1px 5px rgba(0, 0, 0, 0.34)";
const coverForegroundIconShadow = "drop-shadow(0 1px 5px rgba(0, 0, 0, 0.34))";
const coverButtonShadow = "0 1px 5px rgba(0, 0, 0, 0.12)";
const profileCoverBackground = "#1F1F1F";
const profileHeaderHeight = 56;
const profileAvatarTopOffset = 54;
const profileAvatarSize = 120;
const profileCoverHeight =
    profileHeaderHeight + profileAvatarTopOffset + profileAvatarSize / 2;
const ownerEmptyStateGap = "18px";
const photoMasonryGap = "3px";
const photoMasonryRadius = "12px";
interface ProfilePhotoDimensions {
    height: number;
    width: number;
}

const photoAspectRatio = ({ height, width }: ProfilePhotoDimensions): number =>
    height > 0 && width > 0 ? width / height : 1;

export interface ProfilePostItem {
    avatarUrl?: string | null;
    caption?: string;
    friendID?: string;
    height?: number;
    id: string;
    imageUrl: string;
    likeCount?: number;
    name?: string;
    postId?: number;
    timestampMs: number;
    viewerLiked?: boolean;
    width?: number;
}

export interface ProfilePostGroup {
    items: ProfilePostItem[];
    label: string;
}

interface SelectedProfilePost {
    draftImage?: PreparedSpacePostImage;
    draftImageError?: string;
    id: string;
    isDraftImagePreparing?: boolean;
    isDraftImagePreviewPending?: boolean;
    localObjectUrl?: string;
    photo: SpaceViewerPhoto;
    postActionMode?: SpaceViewerPostActionMode;
}

interface PostMasonryTile {
    aspectRatio: number;
    dimensions: ProfilePhotoDimensions;
    index: number;
    item: ProfilePostItem;
}

interface PostMasonryRow {
    aspectRatio: number;
    tiles: PostMasonryTile[];
}

const buildPostMasonryRows = (
    items: ProfilePostItem[],
    loadedDimensionsByURL: Record<string, ProfilePhotoDimensions>,
): PostMasonryRow[] => {
    const tiles = items.map((item, index) => {
        const dimensions = loadedDimensionsByURL[item.imageUrl] ?? {
            height: item.height ?? 1,
            width: item.width ?? 1,
        };
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
    isPostsLoading?: boolean;
    onAddFriend?: () => void;
    onBack?: () => void;
    onCreatePost?: (
        image: PreparedSpacePostImage,
        caption: string,
    ) => Promise<void>;
    onDeletePost?: (postId: number) => Promise<void> | void;
    onDraftPostPublished?: () => void;
    onLoadPostLikers?: (postId: number) => Promise<SpaceLiker[]>;
    onOpenFriend?: (friendID: string) => void;
    onOpenFriends?: () => void;
    onOpenProfileCover?: () => void;
    onOpenProfilePhoto?: () => void;
    onOpenSettings?: () => void;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    onShareProfileLink?: () => Promise<string>;
    postGroups?: ProfilePostGroup[];
    profile: SetupProfile;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
    friendsCount = 0,
    headerVariant = "owner",
    isPostsLoading = false,
    onAddFriend,
    onBack,
    onCreatePost,
    onDeletePost,
    onDraftPostPublished,
    onLoadPostLikers,
    onOpenFriend,
    onOpenFriends,
    onOpenProfileCover,
    onOpenProfilePhoto,
    onOpenSettings,
    onSetPostLiked,
    onShareProfileLink,
    postGroups = [],
    profile,
}) => {
    const [selectedPost, setSelectedPost] =
        useState<SelectedProfilePost | null>(null);
    const [isPostPhotoOpening, setIsPostPhotoOpening] = useState(false);
    const [deletedPostIDs, setDeletedPostIDs] = useState<Set<string>>(
        () => new Set(),
    );
    const [loadedPhotoDimensionsByURL, setLoadedPhotoDimensionsByURL] =
        useState<Record<string, ProfilePhotoDimensions>>({});
    const postInputRef = React.useRef<HTMLInputElement | null>(null);
    const localPostObjectUrlsRef = React.useRef<Set<string>>(new Set());
    const activeLocalPostObjectUrlRef = React.useRef<string | null>(null);
    const isPublicProfile = headerVariant == "public";
    const isOwnerProfile = headerVariant == "owner";
    const isFriendProfile = headerVariant == "friend";
    const displayName = profile.fullName.trim() || profile.username.trim();
    const firstName = firstNameFrom(displayName);
    const initialsSource = displayName || profile.username.trim();
    const initials = initialsFor(initialsSource);
    const visiblePostGroups = postGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => !deletedPostIDs.has(item.id)),
        }))
        .filter((group) => group.items.length > 0);
    const postsSharedCount = visiblePostGroups.reduce(
        (count, group) => count + group.items.length,
        0,
    );
    const canOpenFriends =
        isOwnerProfile && friendsCount > 0 && Boolean(onOpenFriends);
    const canOpenProfileCover = isOwnerProfile && Boolean(onOpenProfileCover);
    const canOpenProfilePhoto = isOwnerProfile && Boolean(onOpenProfilePhoto);
    const hasProfilePosts = postsSharedCount > 0;
    const selectedPostActionMode: SpaceViewerPostActionMode = isPublicProfile
        ? "hidden"
        : isOwnerProfile
          ? "hidden"
          : "like-only";

    const revokeLocalPostObjectUrls = React.useCallback(() => {
        localPostObjectUrlsRef.current.forEach((objectUrl) =>
            URL.revokeObjectURL(objectUrl),
        );
        localPostObjectUrlsRef.current.clear();
    }, []);
    const openPostPhotoPicker = () => {
        if (isPostPhotoOpening) return;

        postInputRef.current?.click();
    };
    const closeSelectedPost = () => {
        activeLocalPostObjectUrlRef.current = null;
        setSelectedPost(null);
        revokeLocalPostObjectUrls();
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

    const prepareSelectedPostPhoto = async (file: File) => {
        const canShowLocalPreview = canPreviewSpaceImageFile(file);
        const localPost = canShowLocalPreview
            ? await createLoadedLocalPostPhoto({
                  avatarUrl: profile.avatarUrl,
                  file,
                  name: displayName || "You",
              })
            : createLocalPostPhoto({
                  avatarUrl: profile.avatarUrl,
                  file,
                  name: displayName || "You",
              });
        localPostObjectUrlsRef.current.add(localPost.objectUrl);
        activeLocalPostObjectUrlRef.current = localPost.objectUrl;
        setSelectedPost({
            id: `local-${localPost.photo.timestampMs}`,
            isDraftImagePreparing: true,
            isDraftImagePreviewPending: !canShowLocalPreview,
            localObjectUrl: localPost.objectUrl,
            photo: localPost.photo,
            postActionMode: "draft-post",
        });

        window.setTimeout(() => {
            if (activeLocalPostObjectUrlRef.current != localPost.objectUrl)
                return;

            void prepareSpacePostImage(file)
                .then((image) => {
                    if (
                        activeLocalPostObjectUrlRef.current !=
                        localPost.objectUrl
                    )
                        return;

                    const preparedPost = canShowLocalPreview
                        ? undefined
                        : createLocalPostPhoto({
                              avatarUrl: profile.avatarUrl,
                              dimensions: image,
                              file: image.file,
                              name: displayName || "You",
                          });
                    if (preparedPost)
                        localPostObjectUrlsRef.current.add(
                            preparedPost.objectUrl,
                        );
                    setSelectedPost((currentPost) => {
                        if (currentPost?.localObjectUrl != localPost.objectUrl)
                            return currentPost;

                        return {
                            ...currentPost,
                            draftImage: image,
                            draftImageError: undefined,
                            isDraftImagePreparing: false,
                            isDraftImagePreviewPending: false,
                            photo: preparedPost
                                ? {
                                      ...currentPost.photo,
                                      height: image.height,
                                      imageUrl: preparedPost.objectUrl,
                                      width: image.width,
                                  }
                                : currentPost.photo,
                        };
                    });
                })
                .catch((error: unknown) => {
                    console.error("Failed to prepare post photo", error);
                    const message = spacePostImageErrorMessage(error);
                    setSelectedPost((currentPost) => {
                        if (currentPost?.localObjectUrl != localPost.objectUrl)
                            return currentPost;

                        return {
                            ...currentPost,
                            draftImageError: message,
                            isDraftImagePreparing: false,
                        };
                    });
                });
        }, 0);
    };

    const handlePostPhotoSelect: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsPostPhotoOpening(true);
        void prepareSelectedPostPhoto(file)
            .catch((error: unknown) => {
                console.error("Failed to open post photo draft", error);
            })
            .finally(() => {
                setIsPostPhotoOpening(false);
            });
    };

    const shareProfile = async () => {
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

    const deleteSelectedPost = async () => {
        if (!selectedPost) return;

        if (selectedPost.photo.postId && onDeletePost) {
            await onDeletePost(selectedPost.photo.postId);
        }
        setDeletedPostIDs((currentPostIDs) => {
            const nextPostIDs = new Set(currentPostIDs);
            nextPostIDs.add(selectedPost.id);
            return nextPostIDs;
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
                        accept={spacePostImageInputAccept}
                        onChange={handlePostPhotoSelect}
                        sx={{ display: "none" }}
                    />
                )}
                <Box
                    className={isFriendProfile ? "green-bg" : undefined}
                    sx={{
                        bgcolor: isFriendProfile
                            ? undefined
                            : profileCoverBackground,
                        height: profileCoverHeight,
                        insetInline: 0,
                        overflow: "hidden",
                        position: "absolute",
                        top: 0,
                        width: "100%",
                        zIndex: 0,
                        "@media (min-width: 600px)": {
                            borderBottomLeftRadius: photoMasonryRadius,
                            borderBottomRightRadius: photoMasonryRadius,
                        },
                    }}
                >
                    {profile.coverUrl && (
                        <Box
                            component="img"
                            alt=""
                            src={profile.coverUrl}
                            sx={{
                                display: "block",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: "center",
                                width: "100%",
                            }}
                        />
                    )}
                </Box>
                {canOpenProfileCover && (
                    <Box
                        component="button"
                        type="button"
                        aria-label="Open cover image"
                        onClick={onOpenProfileCover}
                        sx={{
                            bgcolor: "transparent",
                            border: 0,
                            cursor: "pointer",
                            height: profileCoverHeight,
                            insetInline: 0,
                            p: 0,
                            position: "absolute",
                            top: 0,
                            width: "100%",
                            zIndex: 2,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: -4,
                            },
                        }}
                    />
                )}
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
                        zIndex: 3,
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
                                    filter: coverForegroundIconShadow,
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
                                "& svg": { filter: coverForegroundIconShadow },
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
                                boxShadow: coverButtonShadow,
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
                                px: "4px",
                                textOverflow: "ellipsis",
                                textShadow: coverForegroundShadow,
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
                                "& svg": { filter: coverForegroundIconShadow },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Menu01Icon}
                                size={20}
                                strokeWidth={2.4}
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
                    }}
                >
                    <Box
                        sx={{
                            position: "relative",
                            width: profileAvatarSize,
                            zIndex: 3,
                        }}
                    >
                        <Box
                            component={canOpenProfilePhoto ? "button" : "div"}
                            type={canOpenProfilePhoto ? "button" : undefined}
                            aria-label={
                                canOpenProfilePhoto
                                    ? "Open profile picture"
                                    : undefined
                            }
                            onClick={onOpenProfilePhoto}
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
                                cursor: canOpenProfilePhoto
                                    ? "pointer"
                                    : "default",
                                display: "flex",
                                justifyContent: "center",
                                overflow: "hidden",
                                p: 0,
                                width: "100%",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 3,
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
                                    type="button"
                                    aria-label="Share profile"
                                    onClick={() => void shareProfile()}
                                    sx={{
                                        alignItems: "center",
                                        bgcolor: "transparent",
                                        border: 0,
                                        color: textStrong,
                                        cursor: onShareProfileLink
                                            ? "pointer"
                                            : "default",
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
                                    <ShareIcon strokeWidth={2.2} />
                                </Box>
                            )}
                        </Box>
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
                            <Box component="span">
                                {postsSharedCount == 1 ? "post" : "posts"}
                            </Box>
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
                                <Box component="span">
                                    {friendsCount == 1 ? "friend" : "friends"}
                                </Box>
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
                                        {masonryRows.map((row, rowIndex) => {
                                            const isSingleItemRow =
                                                row.tiles.length == 1;
                                            return (
                                                <Box
                                                    key={`${group.label}-row-${rowIndex}`}
                                                    sx={{
                                                        display: "flex",
                                                        gap: photoMasonryGap,
                                                        aspectRatio:
                                                            isSingleItemRow
                                                                ? undefined
                                                                : `${row.aspectRatio} / 1`,
                                                        width: "100%",
                                                    }}
                                                >
                                                    {row.tiles.map(
                                                        ({
                                                            aspectRatio,
                                                            dimensions,
                                                            item,
                                                            index,
                                                        }) => {
                                                            return (
                                                                <Box
                                                                    component="button"
                                                                    type="button"
                                                                    aria-label={`Open ${displayName} post ${
                                                                        index +
                                                                        1
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
                                                                                    caption:
                                                                                        item.caption,
                                                                                    height: dimensions.height,
                                                                                    imageUrl:
                                                                                        item.imageUrl,
                                                                                    likeCount:
                                                                                        item.likeCount,
                                                                                    name: displayName,
                                                                                    postId: item.postId,
                                                                                    timestampMs:
                                                                                        item.timestampMs,
                                                                                    viewerLiked:
                                                                                        item.viewerLiked,
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
                                                                        flex: isSingleItemRow
                                                                            ? "0 0 100%"
                                                                            : `${aspectRatio} 1 0`,
                                                                        height: isSingleItemRow
                                                                            ? "auto"
                                                                            : "100%",
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
                                                                            index +
                                                                            1
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
                                                                            height: isSingleItemRow
                                                                                ? "auto"
                                                                                : "100%",
                                                                            objectFit:
                                                                                "cover",
                                                                            objectPosition:
                                                                                "center",
                                                                            width: "100%",
                                                                        }}
                                                                    />
                                                                </Box>
                                                            );
                                                        },
                                                    )}
                                                </Box>
                                            );
                                        })}
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
                                flexDirection: "column",
                                justifyContent: "center",
                                minHeight: 0,
                                pb: 0,
                                pointerEvents: "none",
                                position: "absolute",
                                px: 3,
                                top: `${profileCoverHeight}px`,
                                bottom: 0,
                                insetInline: 0,
                                textAlign: "center",
                                width: "100%",
                            }}
                        >
                            {isPostsLoading ? (
                                <SpaceLoadingSpinner ariaLabel="Loading posts" />
                            ) : (
                                <>
                                    {isOwnerProfile && (
                                        <Box
                                            component="img"
                                            alt=""
                                            src="/images/ducky-camera.svg"
                                            sx={{
                                                display: "block",
                                                height: "auto",
                                                mt: ownerEmptyStateGap,
                                                width: 160,
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
                                            mt: isOwnerProfile
                                                ? ownerEmptyStateGap
                                                : 0,
                                            maxWidth: isOwnerProfile
                                                ? 230
                                                : 250,
                                        }}
                                    >
                                        {isOwnerProfile
                                            ? "Your profile is looking empty. Share something with your friends."
                                            : isPublicProfile
                                              ? `${firstName} hasn't posted anything yet. Add them as a friend to get their latest posts.`
                                              : `${firstName} hasn't posted anything yet.`}
                                    </Box>
                                    {isOwnerProfile && (
                                        <Box
                                            component="button"
                                            type="button"
                                            aria-label="Post photo"
                                            disabled={isPostPhotoOpening}
                                            onClick={openPostPhotoPicker}
                                            sx={{
                                                appearance: "none",
                                                alignItems: "center",
                                                bgcolor: "transparent",
                                                border: 0,
                                                boxSizing: "border-box",
                                                color: textBase,
                                                cursor: isPostPhotoOpening
                                                    ? "default"
                                                    : "pointer",
                                                display: "flex",
                                                fontSize: 0,
                                                height: 32,
                                                justifyContent: "center",
                                                lineHeight: 0,
                                                mt: ownerEmptyStateGap,
                                                p: 0,
                                                pointerEvents: "auto",
                                                placeSelf: "center",
                                                placeItems: "center",
                                                width: 32,
                                                "& svg": { display: "block" },
                                                "&:focus-visible": {
                                                    borderRadius: "6px",
                                                    outline: `2px solid ${green}`,
                                                    outlineOffset: 2,
                                                },
                                            }}
                                        >
                                            <HugeiconsIcon
                                                icon={AddSquareIcon}
                                                size={28}
                                                strokeWidth={1.8}
                                            />
                                        </Box>
                                    )}
                                </>
                            )}
                        </Box>
                    )}
                </Box>
                {selectedPost && (
                    <SpaceFileViewer
                        photo={selectedPost.photo}
                        draftPostPreparationError={selectedPost.draftImageError}
                        isDraftPostPreparing={
                            selectedPost.isDraftImagePreparing
                        }
                        isDraftPostPreviewPending={
                            selectedPost.isDraftImagePreviewPending
                        }
                        postActionMode={
                            selectedPost.postActionMode ??
                            selectedPostActionMode
                        }
                        onClose={closeSelectedPost}
                        onDeletePost={
                            isOwnerProfile ? deleteSelectedPost : undefined
                        }
                        onLoadPostLikers={onLoadPostLikers}
                        onOpenFriend={
                            onOpenFriend
                                ? (friendID) => {
                                      closeSelectedPost();
                                      onOpenFriend(friendID);
                                  }
                                : undefined
                        }
                        onOpenProfile={closeSelectedPost}
                        onPublishDraftPost={
                            selectedPost.draftImage && onCreatePost
                                ? (caption) =>
                                      onCreatePost(
                                          selectedPost.draftImage!,
                                          caption,
                                      )
                                : undefined
                        }
                        onDraftPostPublished={onDraftPostPublished}
                        onSetPostLiked={onSetPostLiked}
                    />
                )}
            </Box>
        </Box>
    );
};
