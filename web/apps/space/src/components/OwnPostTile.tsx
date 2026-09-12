import { Box, Skeleton } from "@mui/material";
import { spaceHomeHeaderBarHeight } from "components/HomeHeader";
import {
    SpaceNewPostButton,
    spaceNewPostButtonSize,
} from "components/NewPostButton";
import log from "ente-base/log";
import React from "react";
import type { SpacePost, SpacePostAssetURLLoader } from "services/space";
import { useSpaceAppState, type SpacePostPublishPhase } from "state/app-state";
import { spaceSurfaceHover, spaceText, spaceTextMuted } from "styles/colors";
import { formatSpaceDate } from "utils/display";
import { thumbHashDataURLFromBase64 } from "utils/thumbhash";

const green = "#08C225";
const groupInset = 8;
const groupGap = groupInset * 1.5;
const groupHeight = spaceHomeHeaderBarHeight;

const PostTimestamp: React.FC<{
    timestampMs: number;
    phase?: SpacePostPublishPhase;
    expiresAtMs?: number;
}> = ({ timestampMs, phase, expiresAtMs }) => {
    const [now, setNow] = React.useState(Date.now);

    React.useEffect(() => {
        setNow(Date.now());
        const intervalID = window.setInterval(
            () => setNow(Date.now()),
            phase == "posting" ? 500 : 60_000,
        );
        const timeoutID = expiresAtMs
            ? window.setTimeout(
                  () => setNow(Date.now()),
                  Math.max(0, expiresAtMs - Date.now()),
              )
            : undefined;
        return () => {
            window.clearInterval(intervalID);
            window.clearTimeout(timeoutID);
        };
    }, [phase, expiresAtMs]);

    const status =
        phase && (!expiresAtMs || expiresAtMs > now) ? phase : undefined;
    const label =
        status == "posting"
            ? "Posting"
            : status == "posted"
              ? "Posted"
              : status == "failed"
                ? "Failed"
                : formatSpaceDate(timestampMs);

    return (
        <Box
            component="span"
            role="status"
            aria-label={label}
            sx={{
                color:
                    status == "posted"
                        ? "color(display-p3 0.0314 0.7608 0.1451 / 0.85)"
                        : status == "failed"
                          ? "#FF8585"
                          : spaceTextMuted,
                display: "block",
                fontSize: 12,
                lineHeight: "18px",
            }}
        >
            {status ? (
                label
            ) : (
                <time dateTime={new Date(timestampMs).toISOString()}>
                    {label}
                </time>
            )}
            {status == "posting" && (
                <Box
                    component="span"
                    aria-hidden
                    sx={{
                        display: "inline-block",
                        textAlign: "left",
                        width: "1em",
                    }}
                >
                    {".".repeat((Math.floor(now / 500) % 3) + 1)}
                </Box>
            )}
        </Box>
    );
};

interface SpaceOwnPostTileProps {
    post?: SpacePost;
    isLoading?: boolean;
    isUnavailable?: boolean;
    isNewPostDisabled?: boolean;
    onLoadPostImage?: SpacePostAssetURLLoader;
    onOpenPost?: () => void;
    onNewPost: () => void;
}

export const SpaceOwnPostTile: React.FC<SpaceOwnPostTileProps> = ({
    post,
    isLoading = false,
    isUnavailable = false,
    isNewPostDisabled = false,
    onLoadPostImage,
    onOpenPost,
    onNewPost,
}) => {
    const { postPublication } = useSpaceAppState();
    const tileRef = React.useRef<HTMLElement>(null);
    const publishPhase =
        postPublication?.post == post ? postPublication?.phase : undefined;
    const hasPublication = Boolean(publishPhase);
    const [loadedImage, setLoadedImage] = React.useState<{
        post: SpacePost;
        url?: string;
        failed?: boolean;
    }>();
    const postImage = loadedImage?.post == post ? loadedImage : undefined;
    const imageUrl = post?.imageUrl ?? postImage?.url;
    const thumbHashDataURL = React.useMemo(
        () => thumbHashDataURLFromBase64(post?.thumbHash),
        [post?.thumbHash],
    );
    const unavailable =
        isUnavailable || post?.isUnavailable || postImage?.failed;
    const canOpenPost = Boolean(
        post && onOpenPost && (!publishPhase || publishPhase == "posted"),
    );
    const loading =
        isLoading || Boolean(post?.imageAsset && !imageUrl && !unavailable);
    const [showSkeleton, setShowSkeleton] = React.useState(false);
    const isEmpty = !post && !loading && !unavailable;

    React.useEffect(() => {
        setShowSkeleton(false);
        if (!loading) return;

        const timeoutID = window.setTimeout(() => setShowSkeleton(true), 200);
        return () => window.clearTimeout(timeoutID);
    }, [loading]);

    React.useEffect(() => {
        if (hasPublication)
            tileRef.current?.scrollIntoView({ block: "nearest" });
    }, [hasPublication]);

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
            ref={tileRef}
            component="section"
            aria-label="Your latest post"
            sx={{
                alignItems: "center",
                boxSizing: "border-box",
                display: "flex",
                flexShrink: 0,
                fontFamily: '"Inter Variable", Inter, sans-serif',
                gap: `${groupGap}px`,
                height: groupHeight,
                justifyContent: isEmpty ? "flex-end" : "space-between",
                minWidth: 0,
                "& .MuiSkeleton-root": {
                    visibility: showSkeleton ? "visible" : "hidden",
                },
            }}
        >
            {!isEmpty && (
                <Box
                    component="button"
                    type="button"
                    aria-label="Open your posts"
                    disabled={!canOpenPost}
                    onClick={onOpenPost}
                    sx={{
                        alignItems: "center",
                        appearance: "none",
                        bgcolor: "#232326",
                        border: 0,
                        borderRadius: "12px",
                        color: spaceText,
                        cursor: canOpenPost ? "pointer" : "default",
                        display: "flex",
                        flexShrink: 0,
                        font: "inherit",
                        height: "100%",
                        minWidth: 0,
                        p: 0,
                        textAlign: "left",
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                    }}
                >
                    <Box
                        component="span"
                        sx={{
                            bgcolor: spaceSurfaceHover,
                            borderRadius: "inherit",
                            display: "grid",
                            flexShrink: 0,
                            height: spaceNewPostButtonSize,
                            overflow: "hidden",
                            placeItems: "center",
                            position: "relative",
                            width: spaceNewPostButtonSize,
                        }}
                    >
                        {thumbHashDataURL && !unavailable && (
                            <Box
                                component="img"
                                alt=""
                                src={thumbHashDataURL}
                                sx={{
                                    filter: "blur(8px)",
                                    height: "100%",
                                    inset: 0,
                                    objectFit: "cover",
                                    position: "absolute",
                                    transform: "scale(1.08)",
                                    width: "100%",
                                }}
                            />
                        )}
                        {imageUrl && !unavailable ? (
                            <Box
                                component="img"
                                alt=""
                                src={imageUrl}
                                onError={() =>
                                    post &&
                                    setLoadedImage({ post, failed: true })
                                }
                                sx={{
                                    display: "block",
                                    height: "100%",
                                    objectFit: "cover",
                                    position: "relative",
                                    width: "100%",
                                }}
                            />
                        ) : loading && !thumbHashDataURL ? (
                            <Skeleton
                                variant="rectangular"
                                sx={{ height: "100%", width: "100%" }}
                            />
                        ) : null}
                    </Box>
                    <Box
                        component="span"
                        sx={{
                            boxSizing: "border-box",
                            display: "grid",
                            flexShrink: 0,
                            height: "100%",
                            minWidth: 0,
                            px: `${groupGap}px`,
                            py: `${groupInset}px`,
                            placeItems: "center start",
                            textAlign: "left",
                        }}
                    >
                        {post ? (
                            <PostTimestamp
                                timestampMs={post.timestampMs}
                                phase={publishPhase}
                                expiresAtMs={postPublication?.statusExpiresAtMs}
                            />
                        ) : loading ? (
                            <Skeleton
                                width={72}
                                sx={{ fontSize: 12, lineHeight: "18px" }}
                            />
                        ) : (
                            <Box
                                component="span"
                                sx={{
                                    color: spaceTextMuted,
                                    display: "block",
                                    fontSize: 12,
                                    fontWeight: 400,
                                    lineHeight: "18px",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Post unavailable
                            </Box>
                        )}
                    </Box>
                </Box>
            )}
            <SpaceNewPostButton
                isDisabled={isNewPostDisabled}
                label={isEmpty ? "Share your first photo" : undefined}
                onClick={onNewPost}
            />
        </Box>
    );
};
