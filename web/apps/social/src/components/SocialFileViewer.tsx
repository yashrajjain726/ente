import {
    Cancel01Icon,
    Delete02Icon,
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
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;
const viewerExitDurationMs = 200;
const viewerExitTransition = `${viewerExitDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;

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
    onClose: () => void;
    onDeletePost?: () => void;
    onOpenProfile?: () => void;
    photo: SocialViewerPhoto;
}

export const SocialFileViewer: React.FC<SocialFileViewerProps> = ({
    onClose,
    onDeletePost,
    onOpenProfile,
    photo,
}) => {
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSocialDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);
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
                paddingFn: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
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
            if (event.key == "Escape") onClose();
        };

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [deleteSheetOpen, onClose]);

    return (
        <Box
            ref={viewerRootRef}
            role="dialog"
            aria-label={`${displayName} photo viewer`}
            aria-modal="true"
            sx={{
                bgcolor: viewerBackground,
                color: textBase,
                display: "flex",
                flexDirection: "column",
                inset: 0,
                isolation: "isolate",
                minHeight: "100svh",
                opacity: isDeleteExit ? 0 : 1,
                overflow: "hidden",
                pointerEvents: isDeleteExit ? "none" : "auto",
                position: "fixed",
                transition: `opacity ${viewerExitTransition}`,
                width: "100vw",
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
                            height: 32,
                            justifyContent: "center",
                            overflow: "hidden",
                            p: 0,
                            width: 32,
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
