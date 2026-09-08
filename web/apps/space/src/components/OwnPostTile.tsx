import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import { SpaceAvatarImage } from "components/AvatarImage";
import log from "ente-base/log";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { SpacePost, SpacePostAssetURLLoader } from "services/space";
import { useSpaceAppState } from "state/app-state";
import { spaceSurface, spaceTextMuted } from "styles/colors";
import {
    spacePostTileRadius,
    spaceTileCircleInset,
    spaceTileCornerStyles,
} from "styles/tiles";
import { spaceDefaultCoverImagePath } from "utils/post-image";

const green = "#08C225";
const actionSize = 44;

interface SpaceOwnPostTileProps {
    profile: SetupProfile | null;
    post?: SpacePost;
    isLoading?: boolean;
    isUnavailable?: boolean;
    isNewPostDisabled?: boolean;
    onLoadPostImage?: SpacePostAssetURLLoader;
    onOpenPost?: (imageUrl: string) => void;
    onOpenProfile?: () => void;
    onNewPost: () => void;
}

export const SpaceOwnPostTile: React.FC<SpaceOwnPostTileProps> = ({
    profile,
    post,
    isLoading = false,
    isUnavailable = false,
    isNewPostDisabled = false,
    onLoadPostImage,
    onOpenPost,
    onOpenProfile,
    onNewPost,
}) => {
    const { cachedProfileAvatarUrl } = useSpaceAppState();
    const avatarUrl = profile ? profile.avatarUrl : cachedProfileAvatarUrl;
    const isAvatarLoading =
        !avatarUrl && (!profile || Boolean(profile.avatarObjectID));
    const [loadedImage, setLoadedImage] = React.useState<{
        post: SpacePost;
        url?: string;
        failed?: boolean;
    }>();
    const postImage = loadedImage?.post == post ? loadedImage : undefined;
    const imageUrl = post?.imageUrl ?? postImage?.url;
    const unavailable =
        isUnavailable || post?.isUnavailable || postImage?.failed;
    const loading =
        isLoading || Boolean(post?.imageAsset && !imageUrl && !unavailable);
    const isEmpty = !post && !loading && !unavailable;
    const coverUrl = isEmpty ? spaceDefaultCoverImagePath : imageUrl;

    React.useEffect(() => {
        if (!post?.imageAsset || post.imageUrl || !onLoadPostImage) return;

        let cancelled = false;
        void onLoadPostImage(post.imageAsset)
            .then((url) => {
                if (!cancelled) setLoadedImage({ post, url });
            })
            .catch((error: unknown) => {
                log.warn("Failed to load own latest post image", error);
                if (!cancelled) setLoadedImage({ post, failed: true });
            });
        return () => {
            cancelled = true;
        };
    }, [onLoadPostImage, post]);

    return (
        <Box
            component="section"
            aria-label="Your latest post"
            sx={{
                ...spaceTileCornerStyles(spacePostTileRadius),
                aspectRatio: "1.7",
                bgcolor: spaceSurface,
                flexShrink: 0,
                fontFamily: '"Inter Variable", Inter, sans-serif',
                overflow: "hidden",
                position: "relative",
                width: "100%",
                "& button:focus-visible": {
                    outline: `2px solid ${green}`,
                    outlineOffset: -4,
                },
            }}
        >
            <Box
                component="button"
                type="button"
                aria-label="Open your posts"
                disabled={!imageUrl || unavailable || !onOpenPost}
                onClick={() => imageUrl && onOpenPost?.(imageUrl)}
                sx={{
                    appearance: "none",
                    bgcolor: "transparent",
                    border: 0,
                    borderRadius: "inherit",
                    color: spaceTextMuted,
                    cursor: imageUrl && onOpenPost ? "pointer" : "default",
                    font: "inherit",
                    inset: 0,
                    p: 0,
                    position: "absolute",
                    width: "100%",
                }}
            >
                {coverUrl && !unavailable ? (
                    <Box
                        component="img"
                        alt={isEmpty ? "" : post?.caption || "Your latest post"}
                        src={coverUrl}
                        onError={() =>
                            post && setLoadedImage({ post, failed: true })
                        }
                        sx={{
                            display: "block",
                            height: "100%",
                            objectFit: "cover",
                            width: "100%",
                        }}
                    />
                ) : loading ? (
                    <Skeleton
                        variant="rectangular"
                        sx={{ height: "100%", transform: "none" }}
                    />
                ) : (
                    <Box
                        sx={{
                            fontSize: 15,
                            pb: "56px",
                            px: "var(--space-tile-padding)",
                        }}
                    >
                        Couldn&apos;t load your latest post
                    </Box>
                )}
                {isEmpty && (
                    <Box
                        sx={{
                            alignItems: "center",
                            bgcolor: "rgba(0, 0, 0, 0.18)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            inset: 0,
                            justifyContent: "center",
                            position: "absolute",
                            px: "var(--space-tile-padding)",
                            textAlign: "center",
                        }}
                    >
                        <Box
                            component="span"
                            sx={{
                                bgcolor: "rgba(249, 252, 239, 0.94)",
                                borderRadius: "999px",
                                color: "#24351B",
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: "18px",
                                px: "12px",
                                py: "3px",
                            }}
                        >
                            Your posts will show up here
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                backdropFilter: "blur(12px)",
                                bgcolor: "rgba(28, 28, 30, 0.48)",
                                borderRadius: "999px",
                                color: "#E3E7DA",
                                fontSize: 12,
                                fontWeight: 500,
                                lineHeight: "18px",
                                px: "10px",
                                py: "3px",
                            }}
                        >
                            Share a little moment from your day!
                        </Box>
                    </Box>
                )}
            </Box>
            <Box
                sx={{
                    background:
                        coverUrl && !unavailable
                            ? "linear-gradient(transparent, rgba(0, 0, 0, 0.72))"
                            : undefined,
                    bottom: 0,
                    height: "50%",
                    left: 0,
                    pointerEvents: "none",
                    position: "absolute",
                    right: 0,
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label="Open your profile"
                    onClick={onOpenProfile}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: "transparent",
                        border: 0,
                        borderRadius: "50%",
                        bottom: spaceTileCircleInset(actionSize),
                        cursor: onOpenProfile ? "pointer" : "default",
                        display: "flex",
                        height: actionSize,
                        justifyContent: "center",
                        left: spaceTileCircleInset(actionSize),
                        p: 0,
                        pointerEvents: "auto",
                        position: "absolute",
                        width: actionSize,
                    }}
                >
                    <Box
                        sx={{
                            border: avatarUrl
                                ? "2px solid rgba(255, 255, 255, 0.36)"
                                : "2px solid rgba(255, 255, 255, 0.28)",
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            flexShrink: 0,
                            height: actionSize,
                            overflow: "hidden",
                            width: actionSize,
                        }}
                    >
                        {isAvatarLoading ? (
                            <Skeleton
                                variant="circular"
                                sx={{
                                    bgcolor: spaceSurface,
                                    height: "100%",
                                    width: "100%",
                                }}
                            />
                        ) : (
                            <SpaceAvatarImage src={avatarUrl} />
                        )}
                    </Box>
                </Box>
                <Box
                    className="green-bg"
                    component="button"
                    type="button"
                    aria-label="New post"
                    disabled={isNewPostDisabled}
                    onClick={onNewPost}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: green,
                        border: 0,
                        borderRadius: "50%",
                        bottom: spaceTileCircleInset(actionSize),
                        color: "#FFFFFF",
                        cursor: isNewPostDisabled ? "default" : "pointer",
                        display: "flex",
                        height: actionSize,
                        justifyContent: "center",
                        opacity: isNewPostDisabled ? 0.6 : 1,
                        p: 0,
                        pointerEvents: "auto",
                        position: "absolute",
                        right: spaceTileCircleInset(actionSize),
                        width: actionSize,
                        "&:hover": { bgcolor: "#07B422" },
                        "&:focus-visible": { outlineColor: "#FFFFFF" },
                    }}
                >
                    <HugeiconsIcon icon={Add01Icon} size={24} strokeWidth={2} />
                </Box>
            </Box>
        </Box>
    );
};
