import {
    Cancel01Icon,
    Delete02Icon,
    FavouriteIcon,
    Loading03Icon,
    MoreHorizontalIcon,
    Navigation03Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import {
    spaceActionDoneDurationMs,
    type SpaceActionPhase,
} from "components/SpaceActionFeedback";
import { SpaceLoadingSpinner } from "components/SpaceRouteFallback";
import type PhotoSwipe from "photoswipe";
import React from "react";
import {
    firstNameFrom,
    formatSpaceDate,
    initialsFor,
} from "utils/spaceDisplay";
import { clampSpaceMessageText } from "utils/spaceMessageLimits";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#F4F4F4";
const textSecondary = "#A6A6A6";
const textTertiary = "rgba(244, 244, 244, 0.52)";
const viewerBackground = "#000000";
const controlBackground = "rgba(36, 36, 36, 0.72)";
const controlBackgroundActive = "rgba(58, 58, 58, 0.86)";
const controlBackgroundHover = "rgba(48, 48, 48, 0.86)";
const controlIcon = "#D8D8D8";
const dangerColor = "#F63A3A";
const viewerHeaderHeight = 56;
const viewerBottomPadding = 72;
const captionInputMinHeight = 40;
const replyInputMinHeight = 48;
const replyInputPadding = 14;
const replyInputPaddingLeft = 18;
const captionInputMaxHeight = 112;
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;
const viewerPanelBackground = "#202020";
const viewerPanelMuted = "rgba(244, 244, 244, 0.54)";

const postButtonSpin = keyframes`
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
`;

export type SpaceViewerInitialScreen = "photo" | "likes";

export type SpaceViewerPostActionMode =
    | "draft-post"
    | "hidden"
    | "like-only"
    | "like-with-count";

interface SpaceViewerPostActionConfig {
    showLikeButton: boolean;
    showLikeCount: boolean;
}

const spaceViewerPostActionConfigs: Record<
    SpaceViewerPostActionMode,
    SpaceViewerPostActionConfig
> = {
    "draft-post": { showLikeButton: false, showLikeCount: false },
    hidden: { showLikeButton: false, showLikeCount: false },
    "like-only": { showLikeButton: true, showLikeCount: false },
    "like-with-count": { showLikeButton: true, showLikeCount: true },
};

export interface SpaceViewerPhoto {
    alt?: string;
    avatarUrl?: string | null;
    caption?: string;
    friendID?: string;
    height?: number;
    imageUrl: string;
    likeCount?: number;
    name: string;
    postId?: number;
    timestampMs: number;
    viewerLiked?: boolean;
    width?: number;
}

interface SpaceFileViewerProps {
    initialScreen?: SpaceViewerInitialScreen;
    onClose: () => void;
    onDeletePost?: () => Promise<void> | void;
    onDraftPostPublished?: () => void;
    onLoadPostLikers?: (postId: number) => Promise<SpaceLiker[]>;
    onOpenFriend?: (friendID: string) => void;
    onOpenProfile?: () => void;
    onPublishDraftPost?: (caption: string) => Promise<void>;
    onReplyToPost?: (postId: number, text: string) => Promise<void>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
    photo: SpaceViewerPhoto;
    focusReplyOnOpen?: boolean;
    postActionMode?: SpaceViewerPostActionMode;
}

export interface SpaceLiker {
    id: string;
    avatarUrl?: string | null;
    friendID?: string;
    name: string;
}

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
    width: 48,
    "&:active": { bgcolor: "#3A3A3A" },
    "&:focus-visible": { outline: `2px solid ${green}`, outlineOffset: 2 },
    "&:hover": { bgcolor: controlBackgroundHover },
};

const viewerCountBadgeSx = {
    alignItems: "center",
    bgcolor: "#FFFFFF",
    border: `2px solid ${viewerBackground}`,
    borderRadius: "50%",
    boxSizing: "border-box",
    color: "#111111",
    display: "inline-flex",
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    height: 24,
    justifyContent: "center",
    lineHeight: 1,
    position: "absolute",
    right: -8,
    top: -8,
    width: 24,
};

const SpaceAvatar: React.FC<{
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

const HeartFilledIcon: React.FC = () => (
    <svg
        width="18"
        height="16"
        viewBox="0 0 30 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12.4926 23.4794C8.64537 20.6025 1.02344 14.0254 1.02344 8.10676C1.02344 4.19475 3.89425 1.02344 7.84162 1.02344C9.88707 1.02344 11.9325 1.70526 14.6598 4.43253C17.3871 1.70526 19.4325 1.02344 21.478 1.02344C25.4253 1.02344 28.2962 4.19475 28.2962 8.10676C28.2962 14.0254 20.6743 20.6025 16.827 23.4794C15.5324 24.4474 13.7872 24.4474 12.4926 23.4794Z"
            fill="#08C225"
            stroke="#08C225"
            strokeWidth="2.04545"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const resizeCaptionInput = (
    input: HTMLTextAreaElement | null,
    minHeight = captionInputMinHeight,
) => {
    if (!input) return;

    input.style.height = `${minHeight}px`;
    const nextHeight = Math.min(input.scrollHeight, captionInputMaxHeight);
    input.style.height = `${Math.max(minHeight, nextHeight)}px`;
    input.style.overflowY =
        input.scrollHeight > captionInputMaxHeight ? "auto" : "hidden";
};

export const SpaceFileViewer: React.FC<SpaceFileViewerProps> = ({
    focusReplyOnOpen = false,
    initialScreen = "photo",
    onClose,
    onDeletePost,
    onDraftPostPublished,
    onLoadPostLikers,
    onOpenFriend,
    onOpenProfile,
    onPublishDraftPost,
    onReplyToPost,
    onSetPostLiked,
    photo,
    postActionMode = "like-with-count",
}) => {
    const activePostActionMode = postActionMode;
    const isDraftPost = activePostActionMode == "draft-post";
    const {
        showLikeButton: showPhotoLikeButton,
        showLikeCount: showPhotoLikeCount,
    } = spaceViewerPostActionConfigs[activePostActionMode];
    const canOpenLikes = showPhotoLikeCount;
    const resolvedInitialScreen: SpaceViewerInitialScreen =
        initialScreen == "likes" && !canOpenLikes ? "photo" : initialScreen;
    const [screen, setScreen] = React.useState<SpaceViewerInitialScreen>(
        resolvedInitialScreen,
    );
    const [isPhotoLiked, setIsPhotoLiked] = React.useState(
        photo.viewerLiked ?? false,
    );
    const [caption, setCaption] = React.useState(photo.caption ?? "");
    const [replyText, setReplyText] = React.useState("");
    const [isReplyFocused, setIsReplyFocused] =
        React.useState(focusReplyOnOpen);
    const [replyActionPhase, setReplyActionPhase] =
        React.useState<SpaceActionPhase | null>(null);
    const [serverLikeCount, setServerLikeCount] = React.useState(
        photo.likeCount ?? 0,
    );
    const [photoLikers, setPhotoLikers] = React.useState<SpaceLiker[]>([]);
    const [isLoadingLikers, setIsLoadingLikers] = React.useState(false);
    const [draftPostActionPhase, setDraftPostActionPhase] =
        React.useState<SpaceActionPhase | null>(null);
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSpaceDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const displayCaption = isDraftPost ? "" : caption.trim();
    const hasDisplayCaption = displayCaption.length > 0;
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);
    const captionInputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const replyInputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const likeHoldTimeoutRef = React.useRef<number | null>(null);
    const likeHoldStartPointRef = React.useRef<{ x: number; y: number } | null>(
        null,
    );
    const ignoreNextLikeClickRef = React.useRef(false);
    const suppressNextLikeContextMenuRef = React.useRef(false);
    const suppressLikeContextMenuTimeoutRef = React.useRef<number | null>(null);
    const likeCount = serverLikeCount;
    const likeCountLabel = `${likeCount} ${likeCount == 1 ? "like" : "likes"}`;
    const [actionsAnchor, setActionsAnchor] =
        React.useState<HTMLElement | null>(null);
    const [deleteSheetOpen, setDeleteSheetOpen] = React.useState(false);
    const [deleteActionPhase, setDeleteActionPhase] =
        React.useState<SpaceActionPhase | null>(null);
    const [isDeleteExit, setIsDeleteExit] = React.useState(false);
    const actionsMenuID = "space-viewer-actions-menu";
    const actionsButtonID = "space-viewer-actions-button";
    const isActionsOpen = Boolean(actionsAnchor);
    const isDeleteActionRunning = deleteActionPhase != null;
    const isDraftPostActionRunning = draftPostActionPhase != null;
    const isReplyActionRunning = replyActionPhase != null;
    const canReplyToPost = Boolean(
        !isDraftPost && photo.postId && onReplyToPost,
    );
    const isReplyMode =
        canReplyToPost &&
        (isReplyFocused || replyText.trim().length > 0 || isReplyActionRunning);
    const canSendReply =
        canReplyToPost &&
        Boolean(photo.postId) &&
        replyText.trim().length > 0 &&
        !isReplyActionRunning;

    const clearLikeHoldTimeout = () => {
        if (likeHoldTimeoutRef.current != null) {
            window.clearTimeout(likeHoldTimeoutRef.current);
            likeHoldTimeoutRef.current = null;
        }
        likeHoldStartPointRef.current = null;
    };

    const suppressNativeLikeContextMenu = () => {
        suppressNextLikeContextMenuRef.current = true;
        if (suppressLikeContextMenuTimeoutRef.current != null)
            window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);

        suppressLikeContextMenuTimeoutRef.current = window.setTimeout(() => {
            suppressNextLikeContextMenuRef.current = false;
            suppressLikeContextMenuTimeoutRef.current = null;
        }, 700);
    };

    const openLikes = () => {
        if (!canOpenLikes) return;

        clearLikeHoldTimeout();
        setScreen("likes");
        if (!photo.postId || !onLoadPostLikers) return;

        setIsLoadingLikers(true);
        void onLoadPostLikers(photo.postId)
            .then(setPhotoLikers)
            .catch((error: unknown) =>
                console.error("Failed to load post likers", error),
            )
            .finally(() => setIsLoadingLikers(false));
    };

    const closeLikes = React.useCallback(() => {
        if (likeHoldTimeoutRef.current != null) {
            window.clearTimeout(likeHoldTimeoutRef.current);
            likeHoldTimeoutRef.current = null;
        }
        likeHoldStartPointRef.current = null;
        setScreen("photo");
    }, []);

    const handlePhotoLikeClick = () => {
        if (ignoreNextLikeClickRef.current) {
            ignoreNextLikeClickRef.current = false;
            return;
        }

        if (!photo.postId || !onSetPostLiked) {
            setIsPhotoLiked((isLiked) => !isLiked);
            return;
        }

        const nextLiked = !isPhotoLiked;
        setIsPhotoLiked(nextLiked);
        setServerLikeCount((count) =>
            Math.max(0, count + (nextLiked ? 1 : -1)),
        );
        void onSetPostLiked(photo.postId, nextLiked).catch((error: unknown) => {
            console.error("Failed to update post like", error);
            setIsPhotoLiked(!nextLiked);
            setServerLikeCount((count) =>
                Math.max(0, count + (nextLiked ? -1 : 1)),
            );
        });
    };

    const handlePhotoLikeContextMenu = (
        event: React.MouseEvent<HTMLElement>,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        if (!canOpenLikes) return;

        ignoreNextLikeClickRef.current = false;
        openLikes();
    };

    const handleLikeCountClick = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        openLikes();
    };

    const startPhotoLikeHold = (event: React.PointerEvent<HTMLElement>) => {
        if (!canOpenLikes) return;
        if (event.pointerType == "mouse" && event.button != 0) return;

        clearLikeHoldTimeout();
        likeHoldStartPointRef.current = { x: event.clientX, y: event.clientY };
        likeHoldTimeoutRef.current = window.setTimeout(() => {
            likeHoldTimeoutRef.current = null;
            likeHoldStartPointRef.current = null;
            ignoreNextLikeClickRef.current = true;
            suppressNativeLikeContextMenu();
            openLikes();
            window.setTimeout(() => {
                ignoreNextLikeClickRef.current = false;
            }, 400);
        }, 500);
    };

    const cancelPhotoLikeHoldOnMove = (
        event: React.PointerEvent<HTMLElement>,
    ) => {
        const startPoint = likeHoldStartPointRef.current;
        if (!startPoint) return;

        const distance = Math.hypot(
            event.clientX - startPoint.x,
            event.clientY - startPoint.y,
        );
        if (distance > 8) clearLikeHoldTimeout();
    };

    const closeActions = () => setActionsAnchor(null);

    const requestDeletePost = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        closeActions();
        setDeleteSheetOpen(true);
    };

    const closeDeleteSheet = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        setDeleteSheetOpen(false);
    };

    const confirmDeletePost = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        setDeleteActionPhase("busy");
        void (async () => {
            try {
                await Promise.resolve(onDeletePost?.());
                setDeleteActionPhase("done");
            } catch (error) {
                console.error("Failed to delete space post", error);
                setDeleteActionPhase(null);
            }
        })();
    };

    const publishDraftPost = () => {
        if (
            !isDraftPost ||
            isDraftPostActionRunning ||
            isDeleteExit ||
            !onPublishDraftPost
        )
            return;

        setDraftPostActionPhase("busy");
        void (async () => {
            try {
                await onPublishDraftPost(caption);
                setDraftPostActionPhase("done");
            } catch (error) {
                console.error("Failed to publish space post", error);
                setDraftPostActionPhase(null);
            }
        })();
    };

    const sendReply = () => {
        const text = replyText.trim();
        if (!canSendReply || !photo.postId || !onReplyToPost) return;

        setReplyActionPhase("busy");
        void (async () => {
            try {
                await onReplyToPost(photo.postId!, text);
                setReplyText("");
                setReplyActionPhase("done");
            } catch (error) {
                console.error("Failed to send post reply", error);
                setReplyActionPhase(null);
            }
        })();
    };

    const handleReplyKeyDown = (event: React.KeyboardEvent) => {
        if (event.key != "Enter" || event.shiftKey) return;

        event.preventDefault();
        sendReply();
    };

    const handleReplyActionPointerDown = (event: React.PointerEvent) => {
        event.preventDefault();
    };

    const openFriendProfile = (friendID: string) => {
        onOpenFriend?.(friendID);
    };

    React.useEffect(
        () => () => {
            if (likeHoldTimeoutRef.current != null)
                window.clearTimeout(likeHoldTimeoutRef.current);
            if (suppressLikeContextMenuTimeoutRef.current != null)
                window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);
        },
        [],
    );

    React.useLayoutEffect(() => {
        resizeCaptionInput(captionInputRef.current);
    }, [caption]);

    React.useLayoutEffect(() => {
        resizeCaptionInput(replyInputRef.current, replyInputMinHeight);
    }, [replyText]);

    React.useLayoutEffect(() => {
        if (!focusReplyOnOpen || !canReplyToPost) return;

        setIsReplyFocused(true);
        replyInputRef.current?.focus();
    }, [canReplyToPost, focusReplyOnOpen, photo.postId]);

    React.useEffect(() => {
        const suppressDelayedContextMenu = (event: MouseEvent) => {
            if (!suppressNextLikeContextMenuRef.current) return;

            event.preventDefault();
            event.stopPropagation();
            suppressNextLikeContextMenuRef.current = false;
            if (suppressLikeContextMenuTimeoutRef.current != null) {
                window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);
                suppressLikeContextMenuTimeoutRef.current = null;
            }
        };

        document.addEventListener("contextmenu", suppressDelayedContextMenu, {
            capture: true,
        });
        return () =>
            document.removeEventListener(
                "contextmenu",
                suppressDelayedContextMenu,
                { capture: true },
            );
    }, []);

    React.useEffect(() => {
        if (deleteActionPhase != "done") return;

        const timeoutID = window.setTimeout(() => {
            setDeleteSheetOpen(false);
            setIsDeleteExit(true);
        }, spaceActionDoneDurationMs);

        return () => window.clearTimeout(timeoutID);
    }, [deleteActionPhase]);

    React.useEffect(() => {
        if (draftPostActionPhase != "done") return;

        const timeoutID = window.setTimeout(() => {
            onClose();
            onDraftPostPublished?.();
        }, spaceActionDoneDurationMs);

        return () => window.clearTimeout(timeoutID);
    }, [draftPostActionPhase, onClose, onDraftPostPublished]);

    React.useEffect(() => {
        if (replyActionPhase != "done") return;

        const timeoutID = window.setTimeout(() => {
            setReplyActionPhase(null);
            setIsReplyFocused(false);
        }, spaceActionDoneDurationMs);

        return () => window.clearTimeout(timeoutID);
    }, [replyActionPhase]);

    React.useEffect(() => {
        setIsPhotoLiked(photo.viewerLiked ?? false);
        setCaption(photo.caption ?? "");
        setReplyText("");
        setIsReplyFocused(focusReplyOnOpen && canReplyToPost);
        setReplyActionPhase(null);
        setServerLikeCount(photo.likeCount ?? 0);
        setPhotoLikers([]);
        setScreen(resolvedInitialScreen);
    }, [
        photo.caption,
        photo.imageUrl,
        photo.likeCount,
        photo.postId,
        photo.viewerLiked,
        canReplyToPost,
        focusReplyOnOpen,
        resolvedInitialScreen,
    ]);

    const handleDeleteSheetExited = () => {
        if (!isDeleteExit) return;

        setDeleteActionPhase(null);
    };

    React.useEffect(() => {
        if (!isDeleteExit) return;

        onClose();
    }, [isDeleteExit, onClose]);

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
                mainClass: "pswp-space-viewer",
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
            if (deleteSheetOpen) return;
            if (event.key != "Escape") return;

            if (screen == "likes") {
                closeLikes();
                return;
            }

            onClose();
        };

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [closeLikes, deleteSheetOpen, onClose, screen]);

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
                maxWidth: "100vw",
                minHeight: "100svh",
                overflow: "hidden",
                overflowX: "hidden",
                position: "fixed",
                width: "100%",
                zIndex: 1300,
            }}
        >
            <Box
                component="header"
                data-space-viewer-chrome="true"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    flexShrink: 0,
                    gap: "12px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
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
                        gap: "8px",
                        minWidth: 0,
                    }}
                >
                    <Box
                        component={onOpenProfile ? "button" : "div"}
                        type={onOpenProfile ? "button" : undefined}
                        aria-label={
                            onOpenProfile
                                ? `Open ${displayName}'s profile`
                                : undefined
                        }
                        onClick={onOpenProfile}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: photo.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: 0,
                            borderRadius: "50%",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            flexShrink: 0,
                            height: 28,
                            justifyContent: "center",
                            overflow: "hidden",
                            p: 0,
                            width: 28,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
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
                                    fontSize: 10,
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
                            component={onOpenProfile ? "button" : "span"}
                            type={onOpenProfile ? "button" : undefined}
                            aria-label={
                                onOpenProfile
                                    ? `Open ${displayName}'s profile`
                                    : undefined
                            }
                            onClick={onOpenProfile}
                            sx={{
                                appearance: "none",
                                bgcolor: "transparent",
                                border: 0,
                                color: "inherit",
                                cursor: onOpenProfile ? "pointer" : "default",
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
                            {displayName}
                        </Box>
                        {!isDraftPost && (
                            <>
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
                                    dateTime={new Date(
                                        photo.timestampMs,
                                    ).toISOString()}
                                    sx={{
                                        color: textTertiary,
                                        flexShrink: 0,
                                        fontSize: 12,
                                        fontWeight: 500,
                                    }}
                                >
                                    {dateLabel}
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "16px",
                        justifySelf: "flex-end",
                    }}
                >
                    {onDeletePost && (
                        <Box
                            component="button"
                            id={actionsButtonID}
                            type="button"
                            aria-label="Post actions"
                            aria-controls={
                                isActionsOpen ? actionsMenuID : undefined
                            }
                            aria-expanded={isActionsOpen ? "true" : undefined}
                            aria-haspopup="menu"
                            onClick={(event) =>
                                setActionsAnchor(event.currentTarget)
                            }
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                color: controlIcon,
                                cursor: "pointer",
                                display: "flex",
                                height: 32,
                                justifyContent: "center",
                                p: 0,
                                width: 32,
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { color: textBase },
                            }}
                        >
                            <HugeiconsIcon
                                icon={MoreHorizontalIcon}
                                size={26}
                                strokeWidth={2}
                            />
                        </Box>
                    )}
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
                {onDeletePost && (
                    <Menu
                        id={actionsMenuID}
                        anchorEl={actionsAnchor}
                        open={isActionsOpen}
                        onClose={closeActions}
                        anchorOrigin={{
                            horizontal: "right",
                            vertical: "bottom",
                        }}
                        transformOrigin={{
                            horizontal: "right",
                            vertical: "top",
                        }}
                        slotProps={{
                            paper: {
                                sx: {
                                    bgcolor: "#1E1E1E",
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
                                "aria-labelledby": actionsButtonID,
                                sx: { p: 0 },
                            },
                        }}
                    >
                        <MenuItem
                            disableRipple
                            onClick={requestDeletePost}
                            sx={{
                                alignItems: "center",
                                borderRadius: "10px",
                                color: dangerColor,
                                display: "flex",
                                gap: "8px",
                                minHeight: 38,
                                px: "8px",
                                py: "7px",
                                whiteSpace: "nowrap",
                                "&.Mui-focusVisible": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                                "&:active": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                                "&:hover": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Delete02Icon}
                                size={18}
                                strokeWidth={1.8}
                                style={{ flexShrink: 0 }}
                            />
                            <Box
                                sx={{
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 13,
                                    fontWeight: 650,
                                    lineHeight: "18px",
                                }}
                            >
                                Delete post
                            </Box>
                        </MenuItem>
                    </Menu>
                )}
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
                data-space-viewer-chrome="true"
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
                data-space-viewer-chrome="true"
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
            {isDraftPost ? (
                <Box
                    data-space-viewer-bottom="true"
                    sx={{
                        alignItems: "flex-end",
                        bottom: "16px",
                        boxSizing: "border-box",
                        display: "flex",
                        gap: "8px",
                        left: { xs: "16px", sm: 0 },
                        maxWidth: { sm: 390 },
                        mx: { sm: "auto" },
                        position: "fixed",
                        right: { xs: "16px", sm: 0 },
                        width: { sm: "calc(100% - 32px)" },
                        zIndex: 2,
                    }}
                >
                    <Box
                        ref={captionInputRef}
                        component="textarea"
                        aria-label="Add a caption"
                        disabled={isDraftPostActionRunning}
                        onChange={(event) => {
                            setCaption(event.target.value);
                            resizeCaptionInput(event.currentTarget);
                        }}
                        placeholder="Add a caption..."
                        rows={1}
                        value={caption}
                        sx={{
                            bgcolor: controlBackground,
                            border: 0,
                            borderRadius: "20px",
                            boxSizing: "border-box",
                            color: textBase,
                            flex: "1 1 auto",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: "20px",
                            maxHeight: captionInputMaxHeight,
                            minHeight: captionInputMinHeight,
                            minWidth: 0,
                            outline: 0,
                            overflow: "hidden",
                            px: "14px",
                            py: "10px",
                            resize: "none",
                            "&::placeholder": { color: textSecondary },
                            "&:disabled": { opacity: 0.74 },
                            "&:focus": { bgcolor: controlBackgroundActive },
                        }}
                    />
                    <Box
                        component="button"
                        type="button"
                        aria-label={
                            draftPostActionPhase == "busy"
                                ? "Posting"
                                : draftPostActionPhase == "done"
                                  ? "Posted"
                                  : "Post photo"
                        }
                        disabled={isDraftPostActionRunning}
                        onClick={publishDraftPost}
                        sx={{
                            alignItems: "center",
                            bgcolor: "#FFFFFF",
                            border: 0,
                            borderRadius: "20px",
                            boxSizing: "border-box",
                            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
                            color:
                                draftPostActionPhase == "done"
                                    ? green
                                    : "#111111",
                            cursor: isDraftPostActionRunning
                                ? "default"
                                : "pointer",
                            display: "flex",
                            flexShrink: 0,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 750,
                            height: 40,
                            justifyContent: "center",
                            lineHeight: "20px",
                            minWidth: 70,
                            px: "20px",
                            py: "10px",
                            "&:disabled": { opacity: 1 },
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                            "&:hover": {
                                bgcolor: isDraftPostActionRunning
                                    ? "#FFFFFF"
                                    : "#F0F0F0",
                            },
                        }}
                    >
                        {draftPostActionPhase == "busy" ? (
                            <Box
                                component="span"
                                sx={{
                                    animation: `${postButtonSpin} 2.4s linear infinite`,
                                    display: "flex",
                                    lineHeight: 0,
                                }}
                            >
                                <HugeiconsIcon
                                    icon={Loading03Icon}
                                    size={22}
                                    strokeWidth={1.8}
                                />
                            </Box>
                        ) : draftPostActionPhase == "done" ? (
                            <HugeiconsIcon
                                icon={Tick02Icon}
                                size={22}
                                strokeWidth={1.8}
                            />
                        ) : (
                            "Post"
                        )}
                    </Box>
                </Box>
            ) : null}
            {hasDisplayCaption && (
                <Box
                    component="p"
                    data-space-viewer-chrome="true"
                    title={displayCaption}
                    sx={{
                        boxSizing: "border-box",
                        color: textBase,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 650,
                        bgcolor: "rgba(48, 48, 48, 0.82)",
                        borderRadius: "10px",
                        left: "50%",
                        lineHeight: "20px",
                        m: 0,
                        maxWidth: "calc(100vw - 32px)",
                        minWidth: 0,
                        overflow: "hidden",
                        px: "8px",
                        py: "2px",
                        position: "fixed",
                        textAlign: "center",
                        textOverflow: "ellipsis",
                        textShadow: "0 1px 10px rgba(0, 0, 0, 0.74)",
                        top: "85%",
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                        zIndex: 2,
                    }}
                >
                    {displayCaption}
                </Box>
            )}
            {showPhotoLikeButton && (
                <Box
                    data-space-viewer-bottom="true"
                    sx={{
                        alignItems: "stretch",
                        bottom: "16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                        left: canReplyToPost ? { xs: "16px", sm: 0 } : "auto",
                        maxWidth: canReplyToPost ? { sm: 390 } : undefined,
                        mx: canReplyToPost ? { sm: "auto" } : undefined,
                        position: "fixed",
                        right: "16px",
                        width: canReplyToPost
                            ? { sm: "calc(100% - 32px)" }
                            : undefined,
                        zIndex: 2,
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "flex-end",
                            display: "flex",
                            gap: "8px",
                            justifyContent: "flex-end",
                            width: "100%",
                        }}
                    >
                        {canReplyToPost && (
                            <Box
                                ref={replyInputRef}
                                component="textarea"
                                aria-label="Reply to post"
                                disabled={isReplyActionRunning}
                                onBlur={() => setIsReplyFocused(false)}
                                onChange={(event) => {
                                    const nextText = clampSpaceMessageText(
                                        event.target.value,
                                    );
                                    event.currentTarget.value = nextText;
                                    setReplyText(nextText);
                                    resizeCaptionInput(
                                        event.currentTarget,
                                        replyInputMinHeight,
                                    );
                                }}
                                onFocus={() => setIsReplyFocused(true)}
                                onKeyDown={handleReplyKeyDown}
                                placeholder="Reply"
                                rows={1}
                                value={replyText}
                                sx={{
                                    bgcolor: controlBackground,
                                    border: 0,
                                    borderRadius: "24px",
                                    boxSizing: "border-box",
                                    color: textBase,
                                    flex: "1 1 auto",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    maxHeight: captionInputMaxHeight,
                                    minHeight: replyInputMinHeight,
                                    minWidth: 0,
                                    outline: 0,
                                    overflow: "hidden",
                                    pb: `${replyInputPadding}px`,
                                    pl: `${replyInputPaddingLeft}px`,
                                    pr: `${replyInputPadding}px`,
                                    pt: `${replyInputPadding}px`,
                                    resize: "none",
                                    "&::placeholder": { color: textSecondary },
                                    "&:disabled": { opacity: 0.74 },
                                    "&:focus": {
                                        bgcolor: controlBackgroundActive,
                                    },
                                }}
                            />
                        )}
                        <Box
                            sx={{ height: 48, position: "relative", width: 48 }}
                        >
                            <Box
                                component="button"
                                type="button"
                                aria-label={
                                    isReplyMode
                                        ? replyActionPhase == "busy"
                                            ? "Sending reply"
                                            : replyActionPhase == "done"
                                              ? "Reply sent"
                                              : "Send reply"
                                        : isPhotoLiked
                                          ? "Unlike photo"
                                          : "Like photo"
                                }
                                aria-pressed={
                                    isReplyMode ? undefined : isPhotoLiked
                                }
                                aria-disabled={
                                    isReplyMode && !canSendReply
                                        ? true
                                        : undefined
                                }
                                onClick={
                                    isReplyMode
                                        ? sendReply
                                        : handlePhotoLikeClick
                                }
                                onContextMenuCapture={
                                    isReplyMode
                                        ? undefined
                                        : handlePhotoLikeContextMenu
                                }
                                onPointerCancel={
                                    isReplyMode
                                        ? undefined
                                        : clearLikeHoldTimeout
                                }
                                onPointerDown={
                                    isReplyMode
                                        ? handleReplyActionPointerDown
                                        : startPhotoLikeHold
                                }
                                onPointerLeave={
                                    isReplyMode
                                        ? undefined
                                        : clearLikeHoldTimeout
                                }
                                onPointerMove={
                                    isReplyMode
                                        ? undefined
                                        : cancelPhotoLikeHoldOnMove
                                }
                                onPointerUp={
                                    isReplyMode
                                        ? undefined
                                        : clearLikeHoldTimeout
                                }
                                sx={{
                                    ...viewerActionButtonSx,
                                    bgcolor:
                                        isReplyMode && canSendReply
                                            ? "#FFFFFF"
                                            : controlBackground,
                                    color:
                                        isReplyMode && canSendReply
                                            ? "#111111"
                                            : controlIcon,
                                    cursor:
                                        isReplyMode && !canSendReply
                                            ? "default"
                                            : "pointer",
                                    touchAction: "manipulation",
                                    userSelect: "none",
                                    WebkitTouchCallout: "none",
                                    WebkitUserSelect: "none",
                                }}
                            >
                                {isReplyMode ? (
                                    replyActionPhase == "busy" ? (
                                        <Box
                                            component="span"
                                            sx={{
                                                animation: `${postButtonSpin} 2.4s linear infinite`,
                                                display: "flex",
                                                lineHeight: 0,
                                            }}
                                        >
                                            <HugeiconsIcon
                                                icon={Loading03Icon}
                                                size={22}
                                                strokeWidth={1.8}
                                            />
                                        </Box>
                                    ) : replyActionPhase == "done" ? (
                                        <HugeiconsIcon
                                            icon={Tick02Icon}
                                            primaryColor={green}
                                            size={22}
                                            strokeWidth={1.8}
                                        />
                                    ) : (
                                        <HugeiconsIcon
                                            icon={Navigation03Icon}
                                            size={24}
                                            strokeWidth={1.8}
                                            style={{
                                                transform:
                                                    "translate(-1px, 1px)",
                                            }}
                                        />
                                    )
                                ) : (
                                    <HugeiconsIcon
                                        fill={isPhotoLiked ? green : "none"}
                                        icon={FavouriteIcon}
                                        primaryColor={
                                            isPhotoLiked ? green : undefined
                                        }
                                        size={26}
                                        strokeWidth={1.8}
                                    />
                                )}
                            </Box>
                            {!isReplyMode && showPhotoLikeCount && (
                                <Box
                                    component="button"
                                    type="button"
                                    aria-label={`View ${likeCountLabel}`}
                                    onClick={handleLikeCountClick}
                                    sx={{
                                        ...viewerCountBadgeSx,
                                        cursor: "pointer",
                                        p: 0,
                                        "&:focus-visible": {
                                            outline: `2px solid ${green}`,
                                            outlineOffset: 2,
                                        },
                                    }}
                                >
                                    {likeCount}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
            )}
            {screen == "likes" && canOpenLikes && (
                <Box
                    sx={{
                        bgcolor: viewerPanelBackground,
                        boxSizing: "border-box",
                        color: textBase,
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
                            boxSizing: "border-box",
                            display: "grid",
                            flexShrink: 0,
                            gridTemplateColumns: "1fr 40px",
                            minHeight: 56,
                            px: "16px",
                            width: "100%",
                        }}
                    >
                        <Box
                            component="h1"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 750,
                                lineHeight: "20px",
                                m: 0,
                            }}
                        >
                            {likeCount} {likeCount == 1 ? "like" : "likes"}
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Close likes"
                            onClick={closeLikes}
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
                        component="ul"
                        sx={{
                            boxSizing: "border-box",
                            flex: "1 1 auto",
                            listStyle: "none",
                            m: 0,
                            maxWidth: "100%",
                            minHeight: 0,
                            overflowX: "hidden",
                            overflowY: "auto",
                            p: "14px 16px 18px",
                            position: "relative",
                            width: "100%",
                        }}
                    >
                        {isLoadingLikers ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    bottom: 0,
                                    display: "flex",
                                    justifyContent: "center",
                                    left: 0,
                                    position: "fixed",
                                    right: 0,
                                    top: 0,
                                    zIndex: 1,
                                }}
                            >
                                <SpaceLoadingSpinner ariaLabel="Loading likes" />
                            </Box>
                        ) : photoLikers.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    color: viewerPanelMuted,
                                    display: "flex",
                                    flex: "1 1 auto",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    justifyContent: "center",
                                    lineHeight: "20px",
                                    minHeight: "calc(100svh - 56px - 32px)",
                                }}
                            >
                                No likes yet
                            </Box>
                        ) : (
                            photoLikers.map((liker) => {
                                const likerName = firstNameFrom(liker.name);
                                const friendID = liker.friendID;
                                const canOpenFriend = Boolean(
                                    friendID && onOpenFriend,
                                );
                                const openLikerProfile =
                                    canOpenFriend && friendID
                                        ? () => openFriendProfile(friendID)
                                        : undefined;

                                return (
                                    <Box
                                        component="li"
                                        key={liker.id}
                                        sx={{ listStyle: "none" }}
                                    >
                                        <Box
                                            sx={{
                                                alignItems: "center",
                                                boxSizing: "border-box",
                                                color: "inherit",
                                                display: "flex",
                                                gap: "12px",
                                                minHeight: 52,
                                                px: "2px",
                                                py: "8px",
                                                textAlign: "left",
                                                width: "100%",
                                            }}
                                        >
                                            <Box
                                                component={
                                                    canOpenFriend
                                                        ? "button"
                                                        : "div"
                                                }
                                                type={
                                                    canOpenFriend
                                                        ? "button"
                                                        : undefined
                                                }
                                                onClick={openLikerProfile}
                                                sx={{
                                                    alignItems: "center",
                                                    appearance: "none",
                                                    bgcolor: "transparent",
                                                    border: 0,
                                                    borderRadius: "12px",
                                                    color: "inherit",
                                                    cursor: canOpenFriend
                                                        ? "pointer"
                                                        : "default",
                                                    display: "flex",
                                                    flex: "0 1 auto",
                                                    gap: "12px",
                                                    maxWidth: "100%",
                                                    minWidth: 0,
                                                    p: 0,
                                                    textAlign: "left",
                                                    width: "fit-content",
                                                    "&:focus-visible": {
                                                        outline: `2px solid ${green}`,
                                                        outlineOffset: 2,
                                                    },
                                                }}
                                            >
                                                <SpaceAvatar
                                                    avatarUrl={liker.avatarUrl}
                                                    name={likerName}
                                                    size={36}
                                                />
                                                <Box
                                                    sx={{
                                                        color: textBase,
                                                        flex: "0 1 auto",
                                                        fontFamily:
                                                            '"Inter Variable", Inter, sans-serif',
                                                        fontSize: 14,
                                                        fontWeight: 600,
                                                        lineHeight: "20px",
                                                        minWidth: 0,
                                                        overflow: "hidden",
                                                        textOverflow:
                                                            "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {likerName}
                                                </Box>
                                            </Box>
                                            <Box
                                                aria-hidden
                                                sx={{
                                                    alignItems: "center",
                                                    display: "flex",
                                                    flexShrink: 0,
                                                    justifyContent: "center",
                                                    ml: "auto",
                                                }}
                                            >
                                                <HeartFilledIcon />
                                            </Box>
                                        </Box>
                                    </Box>
                                );
                            })
                        )}
                    </Box>
                </Box>
            )}
            {onDeletePost && (
                <ConfirmationActionSheet
                    appearance="dark"
                    open={deleteSheetOpen}
                    title="Are you sure you want to delete this?"
                    confirmLabel="Yes, delete"
                    confirmActionPhase={deleteActionPhase}
                    confirmDisabled={isDeleteActionRunning}
                    cancelDisabled={isDeleteActionRunning}
                    onCancel={closeDeleteSheet}
                    onConfirm={confirmDeletePost}
                    onExited={handleDeleteSheetExited}
                />
            )}
        </Box>
    );
};
