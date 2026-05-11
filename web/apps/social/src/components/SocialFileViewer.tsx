import {
    Cancel01Icon,
    Comment01Icon,
    FavouriteIcon,
    Navigation03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { formatTimeAgo } from "ente-base/date";
import type PhotoSwipe from "photoswipe";
import React from "react";
import {
    firstNameFrom,
    formatSocialDate,
    initialsFor,
} from "utils/socialDisplay";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#F4F4F4";
const textSecondary = "#A6A6A6";
const textTertiary = "rgba(244, 244, 244, 0.52)";
const viewerBackground = "#000000";
const controlBackground = "rgba(36, 36, 36, 0.72)";
const controlBackgroundHover = "rgba(48, 48, 48, 0.86)";
const controlIcon = "#D8D8D8";
const viewerHeaderHeight = 56;
const viewerBottomPadding = 72;
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;
const commentsBackground = "#202020";
const commentsSurface = "#2C2C2C";
const commentsSurfaceHover = "#343434";
const commentsOwnerBubble = "#3FA43D";
const commentsMuted = "rgba(244, 244, 244, 0.54)";
const commentsTimestamp = "rgba(255, 255, 255, 0.55)";

interface SocialViewerUser {
    avatarUrl?: string | null;
    name: string;
}

export interface SocialViewerPhoto {
    alt?: string;
    avatarUrl?: string | null;
    height?: number;
    imageUrl: string;
    name: string;
    timestampMs: number;
    width?: number;
}

interface SocialFileViewerProps {
    currentUser?: SocialViewerUser;
    onClose: () => void;
    photo: SocialViewerPhoto;
}

interface MockComment {
    id: string;
    author: string;
    avatarUrl?: string | null;
    createdAtMicros: number;
    isOwner?: boolean;
    replyTo?: { author: string; text: string };
    text: string;
}

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;
const microsAgo = (durationMs: number) =>
    microsForTimestamp(Date.now() - durationMs);

const mockComments: MockComment[] = [
    {
        id: "mira",
        author: "Mira Sen",
        avatarUrl: "/images/sample-feed-3.jpg",
        createdAtMicros: microsAgo(12 * minuteMs),
        text: "The colors in this shot are so good.",
    },
    {
        id: "you-reply-mira",
        author: "You",
        createdAtMicros: microsAgo(9 * minuteMs),
        isOwner: true,
        replyTo: {
            author: "Mira Sen",
            text: "The colors in this shot are so good.",
        },
        text: "That evening light did all the work.",
    },
    {
        id: "nikhil",
        author: "Nikhil Rao",
        avatarUrl: "/images/sample-feed-5.jpg",
        createdAtMicros: microsAgo(28 * minuteMs),
        text: "This trail needs to be on our next trip list.",
    },
    {
        id: "aparna",
        author: "Aparna Bhatnagar",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(46 * minuteMs),
        text: "The framing is perfect.",
    },
    {
        id: "mira-reply",
        author: "Mira Sen",
        avatarUrl: "/images/sample-feed-3.jpg",
        createdAtMicros: microsAgo(31 * minuteMs),
        replyTo: {
            author: "Aparna Bhatnagar",
            text: "The framing is perfect.",
        },
        text: "Agree, the path pulls you right in.",
    },
    {
        id: "devika",
        author: "Devika Iyer",
        avatarUrl: "/images/sample-feed-2.jpg",
        createdAtMicros: microsAgo(42 * minuteMs),
        text: "Saving this for the weekend plan.",
    },
    {
        id: "you-reply-devika",
        author: "You",
        createdAtMicros: microsAgo(39 * minuteMs),
        isOwner: true,
        replyTo: {
            author: "Devika Iyer",
            text: "Saving this for the weekend plan.",
        },
        text: "Go early if you want the quiet stretch.",
    },
    {
        id: "kabir",
        author: "Kabir Mehta",
        avatarUrl: "/images/sample-feed-1.jpg",
        createdAtMicros: microsAgo(1 * hourMs),
        text: "Looks peaceful. Was it crowded?",
    },
    {
        id: "you-crowd-reply",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(55 * minuteMs),
        isOwner: true,
        replyTo: {
            author: "Kabir Mehta",
            text: "Looks peaceful. Was it crowded?",
        },
        text: "Not really. We went just after sunrise.",
    },
    {
        id: "samar",
        author: "Samar Jain",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(3 * dayMs),
        text: "The composition makes it feel cinematic.",
    },
    {
        id: "leena",
        author: "Leena Shah",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(8 * dayMs),
        text: "Need the exact location for this one.",
    },
    {
        id: "you-reply-leena",
        author: "You",
        createdAtMicros: microsAgo(8 * dayMs - 34 * minuteMs),
        isOwner: true,
        replyTo: {
            author: "Leena Shah",
            text: "Need the exact location for this one.",
        },
        text: "I will send you the pin.",
    },
];

const viewerActionButtonSx = {
    alignItems: "center",
    bgcolor: controlBackground,
    border: 0,
    borderRadius: "50%",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.36)",
    color: controlIcon,
    cursor: "pointer",
    display: "flex",
    height: 48,
    justifyContent: "center",
    p: 0,
    transition: "background-color 120ms ease, transform 120ms ease",
    width: 48,
    "&:active": { bgcolor: "#3A3A3A", transform: "scale(0.96)" },
    "&:focus-visible": { outline: `2px solid ${green}`, outlineOffset: 2 },
    "&:hover": { bgcolor: controlBackgroundHover },
};

const SocialAvatar: React.FC<{
    avatarUrl?: string | null;
    name: string;
    size: number;
}> = ({ avatarUrl, name, size }) => (
    <Box
        sx={{
            alignItems: "center",
            bgcolor: avatarUrl ? "transparent" : paleGreen,
            borderRadius: "50%",
            color: green,
            display: "flex",
            flexShrink: 0,
            height: size,
            justifyContent: "center",
            overflow: "hidden",
            width: size,
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
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: Math.max(10, Math.round(size * 0.34)),
                    fontWeight: 800,
                    lineHeight: 1,
                }}
            >
                {initialsFor(name)}
            </Box>
        )}
    </Box>
);

const CommentItem: React.FC<{ comment: MockComment }> = ({ comment }) => {
    const isOwner = Boolean(comment.isOwner);
    const authorName = firstNameFrom(comment.author);
    const replyAuthorName = comment.replyTo
        ? firstNameFrom(comment.replyTo.author)
        : undefined;
    const timestampLabel = formatTimeAgo(comment.createdAtMicros);
    const timestampDateTime = new Date(
        Math.floor(comment.createdAtMicros / 1000),
    ).toISOString();

    return (
        <Box
            component="li"
            sx={{
                alignItems: isOwner ? "flex-end" : "flex-start",
                display: "flex",
                flexDirection: "column",
                listStyle: "none",
                maxWidth: "100%",
                minWidth: 0,
                width: "100%",
            }}
        >
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    gap: "10px",
                    justifyContent: isOwner ? "flex-end" : "flex-start",
                    maxWidth: "min(calc(100vw - 32px), 360px)",
                    minWidth: 0,
                    width: isOwner ? "auto" : "100%",
                }}
            >
                {!isOwner && (
                    <SocialAvatar
                        avatarUrl={comment.avatarUrl}
                        name={authorName}
                        size={28}
                    />
                )}
                {isOwner ? (
                    <Box
                        component="time"
                        dateTime={timestampDateTime}
                        sx={{
                            color: commentsTimestamp,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 600,
                            lineHeight: "16px",
                            mr: "2px",
                        }}
                    >
                        {timestampLabel}
                    </Box>
                ) : (
                    <Box
                        sx={{
                            alignItems: "baseline",
                            display: "flex",
                            gap: "4px",
                            minWidth: 0,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <Box
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 750,
                                lineHeight: "20px",
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {authorName}
                        </Box>
                        <Box
                            aria-hidden
                            sx={{
                                color: commentsTimestamp,
                                flexShrink: 0,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: "16px",
                            }}
                        >
                            •
                        </Box>
                        <Box
                            component="time"
                            dateTime={timestampDateTime}
                            sx={{
                                color: commentsTimestamp,
                                flexShrink: 0,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: "16px",
                            }}
                        >
                            {timestampLabel}
                        </Box>
                    </Box>
                )}
            </Box>
            <Box
                className={isOwner ? "green-bg" : undefined}
                sx={{
                    bgcolor: isOwner ? commentsOwnerBubble : commentsSurface,
                    borderRadius: isOwner
                        ? "20px 6px 20px 20px"
                        : "6px 20px 20px 20px",
                    color: textBase,
                    maxWidth: "min(calc(100vw - 72px), 360px)",
                    minWidth: 0,
                    ml: isOwner ? 0 : "28px",
                    mt: isOwner ? "6px" : "12px",
                    overflow: "hidden",
                    px: "16px",
                    py: comment.replyTo ? "16px" : "14px",
                    width: "fit-content",
                }}
            >
                {comment.replyTo && (
                    <Box
                        sx={{
                            alignItems: "stretch",
                            display: "flex",
                            gap: "10px",
                            mb: "8px",
                            maxWidth: "100%",
                            minWidth: 0,
                        }}
                    >
                        <Box
                            aria-hidden
                            sx={{
                                alignSelf: "stretch",
                                bgcolor: isOwner
                                    ? "rgba(255, 255, 255, 0.55)"
                                    : "#8C8C8C",
                                borderRadius: "999px",
                                flexShrink: 0,
                                width: 3,
                            }}
                        />
                        <Box sx={{ minWidth: 0 }}>
                            <Box
                                sx={{
                                    color: "rgba(244, 244, 244, 0.92)",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 12,
                                    fontWeight: 750,
                                    lineHeight: "18px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {replyAuthorName}
                            </Box>
                            <Box
                                sx={{
                                    color: "rgba(244, 244, 244, 0.82)",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    lineHeight: "17px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {comment.replyTo.text}
                            </Box>
                        </Box>
                    </Box>
                )}
                <Box
                    sx={{
                        color: "rgba(244, 244, 244, 0.94)",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: "22px",
                        overflowWrap: "anywhere",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {comment.text}
                </Box>
            </Box>
        </Box>
    );
};

export const SocialFileViewer: React.FC<SocialFileViewerProps> = ({
    currentUser,
    onClose,
    photo,
}) => {
    const [screen, setScreen] = React.useState<"photo" | "comments">("photo");
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSocialDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);
    const currentUserName = currentUser?.name.trim() || "You";

    React.useEffect(() => {
        const root = viewerRootRef.current;
        if (!root) return;

        let disposed = false;
        let closedByReact = false;
        let pswp: PhotoSwipe | undefined;

        void import("photoswipe").then(({ default: PhotoSwipeClass }) => {
            if (disposed || !viewerRootRef.current) return;

            pswp = new PhotoSwipeClass({
                allowPanToNext: false,
                appendToEl: viewerRootRef.current,
                arrowKeys: false,
                arrowNext: false,
                arrowPrev: false,
                bgClickAction: false,
                bgOpacity: 1,
                clickToCloseNonZoomable: false,
                close: false,
                closeOnVerticalDrag: false,
                counter: false,
                dataSource: [
                    {
                        alt: photo.alt ?? `${photo.name} post`,
                        height: photo.height ?? defaultPhotoHeight,
                        src: photo.imageUrl,
                        width: photo.width ?? defaultPhotoWidth,
                    },
                ],
                doubleTapAction: "zoom",
                errorMsg: "Unable to preview this photo",
                escKey: false,
                imageClickAction: "zoom",
                index: 0,
                loop: false,
                mainClass: "pswp-social-viewer",
                maxZoomLevel: 4,
                paddingFn: () => ({
                    bottom: viewerBottomPadding,
                    left: 0,
                    right: 0,
                    top: viewerHeaderHeight,
                }),
                pinchToClose: false,
                returnFocus: false,
                secondaryZoomLevel: 2,
                showHideAnimationType: "none",
                spacing: 0,
                tapAction: false,
                trapFocus: false,
                wheelToZoom: true,
                zoom: false,
            });
            pswp.on("close", () => {
                if (!closedByReact) onClose();
            });
            pswp.init();
        });

        return () => {
            disposed = true;
            closedByReact = true;
            pswp?.destroy();
        };
    }, [
        onClose,
        photo.alt,
        photo.height,
        photo.imageUrl,
        photo.name,
        photo.width,
    ]);

    React.useEffect(() => {
        if (typeof document == "undefined") return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    React.useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key == "Escape") onClose();
        };

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    return (
        <Box
            ref={viewerRootRef}
            role="dialog"
            aria-label={`${displayName} photo viewer`}
            aria-modal="true"
            sx={{
                bgcolor: viewerBackground,
                boxSizing: "border-box",
                color: textBase,
                display: "flex",
                flexDirection: "column",
                inset: 0,
                isolation: "isolate",
                minHeight: "100svh",
                maxWidth: "100vw",
                overflow: "hidden",
                overflowX: "hidden",
                position: "fixed",
                width: "100%",
                zIndex: 1300,
            }}
        >
            <Box
                component="header"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    flexShrink: 0,
                    gap: "12px",
                    gridTemplateColumns: "minmax(0, 1fr) 40px",
                    minHeight: viewerHeaderHeight,
                    position: "relative",
                    px: "16px",
                    width: "100%",
                    zIndex: 2,
                }}
            >
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "10px",
                        minWidth: 0,
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            bgcolor: photo.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            borderRadius: "50%",
                            color: green,
                            display: "flex",
                            flexShrink: 0,
                            height: 32,
                            justifyContent: "center",
                            overflow: "hidden",
                            width: 32,
                        }}
                    >
                        {photo.avatarUrl ? (
                            <Box
                                component="img"
                                alt=""
                                src={photo.avatarUrl}
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
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 11,
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
                            alignItems: "baseline",
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
                            component="span"
                            sx={{
                                fontWeight: 650,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {displayName}
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
                            dateTime={new Date(photo.timestampMs).toISOString()}
                            sx={{
                                color: textTertiary,
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
                    aria-label="Close viewer"
                    onClick={onClose}
                    sx={{
                        alignItems: "center",
                        bgcolor: controlBackground,
                        border: 0,
                        borderRadius: "50%",
                        color: controlIcon,
                        cursor: "pointer",
                        display: "flex",
                        height: 28,
                        justifyContent: "center",
                        justifySelf: "flex-end",
                        p: 0,
                        width: 28,
                        "&:focus-visible": {
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                        "&:hover": { bgcolor: controlBackgroundHover },
                    }}
                >
                    <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={18}
                        strokeWidth={1.8}
                    />
                </Box>
            </Box>
            <Box
                sx={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    position: "relative",
                    width: "100%",
                }}
            />
            <Box
                aria-hidden
                sx={{
                    background:
                        "linear-gradient(180deg, rgba(0, 0, 0, 0.32) 0%, rgba(0, 0, 0, 0.13) 58%, rgba(0, 0, 0, 0) 100%)",
                    height: 44,
                    left: 0,
                    pointerEvents: "none",
                    position: "fixed",
                    right: 0,
                    top: 0,
                    zIndex: 1,
                }}
            />
            <Box
                aria-hidden
                sx={{
                    background:
                        "linear-gradient(0deg, rgba(0, 0, 0, 0.34) 0%, rgba(0, 0, 0, 0.14) 58%, rgba(0, 0, 0, 0) 100%)",
                    bottom: 0,
                    height: 52,
                    left: 0,
                    pointerEvents: "none",
                    position: "fixed",
                    right: 0,
                    zIndex: 1,
                }}
            />
            <Box
                sx={{
                    bottom: "16px",
                    display: "flex",
                    gap: "10px",
                    position: "fixed",
                    right: "16px",
                    zIndex: 2,
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label="Like photo"
                    sx={viewerActionButtonSx}
                >
                    <HugeiconsIcon
                        icon={FavouriteIcon}
                        size={26}
                        strokeWidth={1.8}
                    />
                </Box>
                <Box
                    component="button"
                    type="button"
                    aria-label="Comment on photo"
                    onClick={() => setScreen("comments")}
                    sx={viewerActionButtonSx}
                >
                    <HugeiconsIcon
                        icon={Comment01Icon}
                        size={26}
                        strokeWidth={1.8}
                    />
                </Box>
            </Box>
            {screen == "comments" && (
                <Box
                    sx={{
                        bgcolor: commentsBackground,
                        color: textBase,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        inset: 0,
                        maxWidth: "100vw",
                        overflow: "hidden",
                        overflowX: "hidden",
                        position: "fixed",
                        width: "100%",
                        zIndex: 3,
                    }}
                >
                    <Box
                        component="header"
                        sx={{
                            alignItems: "center",
                            display: "grid",
                            flexShrink: 0,
                            gridTemplateColumns: "1fr 40px",
                            minHeight: 56,
                            px: "16px",
                            boxSizing: "border-box",
                            width: "100%",
                        }}
                    >
                        <Box
                            component="h1"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 18,
                                fontWeight: 750,
                                lineHeight: "24px",
                                m: 0,
                            }}
                        >
                            Comments
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Close comments"
                            onClick={() => setScreen("photo")}
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                borderRadius: "50%",
                                color: controlIcon,
                                cursor: "pointer",
                                display: "flex",
                                height: 28,
                                justifyContent: "center",
                                justifySelf: "flex-end",
                                p: 0,
                                width: 28,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": {
                                    bgcolor: "transparent",
                                    color: textBase,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={18}
                                strokeWidth={1.8}
                            />
                        </Box>
                    </Box>
                    <Box
                        component="ol"
                        sx={{
                            display: "flex",
                            flex: "1 1 auto",
                            flexDirection: "column",
                            gap: "22px",
                            m: 0,
                            boxSizing: "border-box",
                            maxWidth: "100%",
                            minHeight: 0,
                            overflowX: "hidden",
                            overflowY: "auto",
                            p: "14px 16px 18px",
                            width: "100%",
                        }}
                    >
                        {mockComments.map((comment) => (
                            <CommentItem key={comment.id} comment={comment} />
                        ))}
                    </Box>
                    <Box
                        sx={{
                            bgcolor: commentsBackground,
                            boxSizing: "border-box",
                            flexShrink: 0,
                            maxWidth: "100%",
                            p: "18px 14px max(12px, env(safe-area-inset-bottom))",
                            width: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                alignItems: "center",
                                bgcolor: commentsSurface,
                                borderRadius: "999px",
                                boxSizing: "border-box",
                                display: "grid",
                                gap: "8px",
                                gridTemplateColumns: "28px minmax(0, 1fr) 36px",
                                maxWidth: "100%",
                                minHeight: 44,
                                minWidth: 0,
                                overflow: "hidden",
                                p: "4px 4px 4px 6px",
                                width: "100%",
                            }}
                        >
                            <SocialAvatar
                                avatarUrl={currentUser?.avatarUrl}
                                name={currentUserName}
                                size={28}
                            />
                            <Box
                                component="input"
                                aria-label="Add a comment"
                                placeholder="Add a comment..."
                                sx={{
                                    appearance: "none",
                                    bgcolor: "transparent",
                                    border: 0,
                                    color: textBase,
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    lineHeight: "20px",
                                    minWidth: 0,
                                    outline: 0,
                                    p: 0,
                                    width: "100%",
                                    "&::placeholder": {
                                        color: commentsMuted,
                                        opacity: 1,
                                    },
                                }}
                            />
                            <Box
                                component="button"
                                type="button"
                                aria-label="Send comment"
                                sx={{
                                    alignItems: "center",
                                    bgcolor: commentsSurfaceHover,
                                    border: 0,
                                    borderRadius: "50%",
                                    color: controlIcon,
                                    cursor: "pointer",
                                    display: "flex",
                                    height: 36,
                                    justifyContent: "center",
                                    p: 0,
                                    width: 36,
                                    "&:focus-visible": {
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 2,
                                    },
                                    "&:hover": {
                                        bgcolor: "rgba(255, 255, 255, 0.14)",
                                    },
                                }}
                            >
                                <HugeiconsIcon
                                    icon={Navigation03Icon}
                                    size={20}
                                    strokeWidth={1.8}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
};
