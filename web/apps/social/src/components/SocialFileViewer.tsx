import {
    Cancel01Icon,
    Delete02Icon,
    FavouriteIcon,
    MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem } from "@mui/material";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import {
    socialActionBusyDurationMs,
    socialActionDoneDurationMs,
    type SocialActionPhase,
} from "components/SocialActionFeedback";
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
const dangerColor = "#F63A3A";
const viewerHeaderHeight = 56;
const viewerBottomPadding = 72;
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;
const viewerExitDurationMs = 200;
const viewerExitTransition = `${viewerExitDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
const viewerPanelBackground = "#202020";
const viewerPanelMuted = "rgba(244, 244, 244, 0.54)";

interface SocialViewerUser {
    avatarUrl?: string | null;
    name: string;
}

export type SocialViewerInitialScreen = "photo" | "likes";

export type SocialViewerPostActionMode =
    | "hidden"
    | "like-only"
    | "like-with-count";

interface SocialViewerPostActionConfig {
    showLikeButton: boolean;
    showLikeCount: boolean;
}

const socialViewerPostActionConfigs: Record<
    SocialViewerPostActionMode,
    SocialViewerPostActionConfig
> = {
    hidden: { showLikeButton: false, showLikeCount: false },
    "like-only": { showLikeButton: true, showLikeCount: false },
    "like-with-count": { showLikeButton: true, showLikeCount: true },
};

export interface SocialViewerPhoto {
    alt?: string;
    avatarUrl?: string | null;
    friendID?: string;
    height?: number;
    imageUrl: string;
    name: string;
    timestampMs: number;
    width?: number;
}

interface SocialFileViewerProps {
    currentUser?: SocialViewerUser;
    initialScreen?: SocialViewerInitialScreen;
    onClose: () => void;
    onDeletePost?: () => void;
    onOpenFriend?: (friendID: string) => void;
    onOpenProfile?: () => void;
    photo: SocialViewerPhoto;
    postActionMode?: SocialViewerPostActionMode;
}

interface SocialLiker {
    id: string;
    avatarUrl?: string | null;
    friendID?: string;
    name: string;
}

const mockPhotoLikers: SocialLiker[] = [
    {
        id: "mira",
        avatarUrl: "/images/sample-feed-3.jpg",
        friendID: "mira-sen",
        name: "Mira Sen",
    },
    {
        id: "kabir",
        avatarUrl: "/images/sample-feed-1.jpg",
        friendID: "kabir-menon",
        name: "Kabir Menon",
    },
    {
        id: "devika",
        avatarUrl: "/images/sample-feed-2.jpg",
        friendID: "isha-mehta",
        name: "Isha Mehta",
    },
    {
        id: "nikhil",
        avatarUrl: "/images/sample-feed-5.jpg",
        friendID: "nikhil-rao",
        name: "Nikhil Rao",
    },
];

const friendIDForPersonName = (name: string): string | undefined => {
    switch (name.trim()) {
        case "Aparna Bhatnagar":
            return "aparna-bhatnagar";
        case "Isha Mehta":
            return "isha-mehta";
        case "Kabir Menon":
            return "kabir-menon";
        case "Riya Kapoor":
            return "riya-kapoor";
        case "Mira Sen":
            return "mira-sen";
        case "Nikhil Rao":
            return "nikhil-rao";
        default:
            return undefined;
    }
};

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

export const SocialFileViewer: React.FC<SocialFileViewerProps> = ({
    currentUser,
    initialScreen = "photo",
    onClose,
    onDeletePost,
    onOpenFriend,
    onOpenProfile,
    photo,
    postActionMode = "like-with-count",
}) => {
    const {
        showLikeButton: showPhotoLikeButton,
        showLikeCount: showPhotoLikeCount,
    } = socialViewerPostActionConfigs[postActionMode];
    const canOpenLikes = showPhotoLikeCount;
    const resolvedInitialScreen: SocialViewerInitialScreen =
        initialScreen == "likes" && !canOpenLikes ? "photo" : initialScreen;
    const [screen, setScreen] = React.useState<SocialViewerInitialScreen>(
        resolvedInitialScreen,
    );
    const [isPhotoLiked, setIsPhotoLiked] = React.useState(false);
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSocialDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);
    const likeHoldTimeoutRef = React.useRef<number | null>(null);
    const likeHoldStartPointRef = React.useRef<{ x: number; y: number } | null>(
        null,
    );
    const ignoreNextLikeClickRef = React.useRef(false);
    const suppressNextLikeContextMenuRef = React.useRef(false);
    const suppressLikeContextMenuTimeoutRef = React.useRef<number | null>(null);
    const photoLikers = React.useMemo(() => {
        if (!isPhotoLiked) return mockPhotoLikers;

        return [
            {
                id: "current-user",
                avatarUrl: currentUser?.avatarUrl,
                name: "You",
            },
            ...mockPhotoLikers,
        ];
    }, [currentUser?.avatarUrl, isPhotoLiked]);
    const likeCount = photoLikers.length;
    const likeCountLabel = `${likeCount} ${likeCount == 1 ? "like" : "likes"}`;
    const [actionsAnchor, setActionsAnchor] =
        React.useState<HTMLElement | null>(null);
    const [deleteSheetOpen, setDeleteSheetOpen] = React.useState(false);
    const [deleteActionPhase, setDeleteActionPhase] =
        React.useState<SocialActionPhase | null>(null);
    const [isDeleteExit, setIsDeleteExit] = React.useState(false);
    const actionsMenuID = "social-viewer-actions-menu";
    const actionsButtonID = "social-viewer-actions-button";
    const isActionsOpen = Boolean(actionsAnchor);
    const isDeleteActionRunning = deleteActionPhase != null;

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

        setIsPhotoLiked((isLiked) => !isLiked);
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
        if (!deleteActionPhase) return;

        const timeoutID = window.setTimeout(
            () => {
                if (deleteActionPhase == "busy") {
                    setDeleteActionPhase("done");
                    return;
                }

                setDeleteSheetOpen(false);
                onDeletePost?.();
                setIsDeleteExit(true);
            },
            deleteActionPhase == "busy"
                ? socialActionBusyDurationMs
                : socialActionDoneDurationMs,
        );

        return () => window.clearTimeout(timeoutID);
    }, [deleteActionPhase, onDeletePost]);

    const handleDeleteSheetExited = () => {
        if (!isDeleteExit) return;

        setDeleteActionPhase(null);
    };

    React.useEffect(() => {
        if (!isDeleteExit) return;

        const timeoutID = window.setTimeout(onClose, viewerExitDurationMs);
        return () => window.clearTimeout(timeoutID);
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
                opacity: isDeleteExit ? 0 : 1,
                overflow: "hidden",
                overflowX: "hidden",
                pointerEvents: isDeleteExit ? "none" : "auto",
                position: "fixed",
                transition: isDeleteExit
                    ? `opacity ${viewerExitTransition}`
                    : undefined,
                width: "100%",
                zIndex: 1300,
            }}
        >
            <Box
                component="header"
                data-social-viewer-chrome="true"
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
                        gap: "10px",
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
                data-social-viewer-chrome="true"
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
                data-social-viewer-chrome="true"
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
            {showPhotoLikeButton && (
                <Box
                    data-social-viewer-bottom="true"
                    sx={{
                        bottom: "16px",
                        display: "flex",
                        gap: "10px",
                        position: "fixed",
                        right: "16px",
                        zIndex: 2,
                    }}
                >
                    <Box sx={{ height: 48, position: "relative", width: 48 }}>
                        <Box
                            component="button"
                            type="button"
                            aria-label={
                                isPhotoLiked ? "Unlike photo" : "Like photo"
                            }
                            aria-pressed={isPhotoLiked}
                            onClick={handlePhotoLikeClick}
                            onContextMenuCapture={handlePhotoLikeContextMenu}
                            onPointerCancel={clearLikeHoldTimeout}
                            onPointerDown={startPhotoLikeHold}
                            onPointerLeave={clearLikeHoldTimeout}
                            onPointerMove={cancelPhotoLikeHoldOnMove}
                            onPointerUp={clearLikeHoldTimeout}
                            sx={{
                                ...viewerActionButtonSx,
                                touchAction: "manipulation",
                                userSelect: "none",
                                WebkitTouchCallout: "none",
                                WebkitUserSelect: "none",
                            }}
                        >
                            <HugeiconsIcon
                                fill={isPhotoLiked ? green : "none"}
                                icon={FavouriteIcon}
                                primaryColor={isPhotoLiked ? green : undefined}
                                size={26}
                                strokeWidth={1.8}
                            />
                        </Box>
                        {showPhotoLikeCount && (
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
                            width: "100%",
                        }}
                    >
                        {photoLikers.length == 0 ? (
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
                                    minHeight: "100%",
                                }}
                            >
                                No likes yet
                            </Box>
                        ) : (
                            photoLikers.map((liker) => {
                                const likerName = firstNameFrom(liker.name);
                                const friendID =
                                    liker.friendID ??
                                    friendIDForPersonName(liker.name);
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
                                                <SocialAvatar
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
