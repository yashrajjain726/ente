import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import { SpaceAvatarImage } from "components/AvatarImage";
import log from "ente-base/log";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { SpacePost, SpacePostAssetURLLoader } from "services/space";
import { spaceSurface, spaceText, spaceTextMuted } from "styles/colors";

const green = "#08C225";

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
                aspectRatio: "1.7",
                bgcolor: spaceSurface,
                borderRadius: "24px",
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
                {imageUrl && !unavailable ? (
                    <Box
                        component="img"
                        alt={post?.caption || "Your latest post"}
                        src={imageUrl}
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
                    <Box sx={{ fontSize: 15, pb: "56px", px: "24px" }}>
                        {unavailable
                            ? "Couldn't load your latest post"
                            : "Share your first photo"}
                    </Box>
                )}
            </Box>
            <Box
                sx={{
                    alignItems: "center",
                    background:
                        imageUrl && !unavailable
                            ? "linear-gradient(transparent, rgba(0, 0, 0, 0.72))"
                            : undefined,
                    bottom: 0,
                    display: "flex",
                    gap: "12px",
                    justifyContent: "space-between",
                    left: 0,
                    p: "32px 16px 16px",
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
                        borderRadius: "12px",
                        color: spaceText,
                        cursor: onOpenProfile ? "pointer" : "default",
                        display: "flex",
                        font: "inherit",
                        gap: "10px",
                        minWidth: 0,
                        p: 0,
                        pointerEvents: "auto",
                        textAlign: "left",
                    }}
                >
                    <Box
                        sx={{
                            border: "2px solid rgba(255, 255, 255, 0.8)",
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            flexShrink: 0,
                            height: 44,
                            overflow: "hidden",
                            width: 44,
                        }}
                    >
                        <SpaceAvatarImage src={profile?.avatarUrl} />
                    </Box>
                    <Box>
                        <Box sx={{ fontSize: 16, fontWeight: 650 }}>You</Box>
                        {post && (
                            <Box sx={{ fontSize: 11, mt: "3px", opacity: 0.8 }}>
                                Latest post
                            </Box>
                        )}
                    </Box>
                </Box>
                <Box
                    className="green-bg"
                    component="button"
                    type="button"
                    disabled={isNewPostDisabled}
                    onClick={onNewPost}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: green,
                        border: 0,
                        borderRadius: "999px",
                        color: "#FFFFFF",
                        cursor: isNewPostDisabled ? "default" : "pointer",
                        display: "flex",
                        flexShrink: 0,
                        font: "inherit",
                        fontSize: 13,
                        fontWeight: 650,
                        gap: "6px",
                        minHeight: 44,
                        opacity: isNewPostDisabled ? 0.6 : 1,
                        px: "14px",
                        pointerEvents: "auto",
                        "&:hover": { bgcolor: "#07B422" },
                        "&:focus-visible": { outlineColor: "#FFFFFF" },
                    }}
                >
                    <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2} />
                    New post
                </Box>
            </Box>
        </Box>
    );
};
