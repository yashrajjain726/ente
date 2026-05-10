import {
    Cancel01Icon,
    Comment01Icon,
    FavouriteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
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
const viewerBackground = "#000000";
const controlBackground = "rgba(36, 36, 36, 0.72)";
const controlBackgroundHover = "rgba(48, 48, 48, 0.86)";
const closeControlBackground = "#242424";
const controlIcon = "#D8D8D8";
const viewerHeaderHeight = 56;
const viewerBottomPadding = 72;
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;

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
    onClose: () => void;
    photo: SocialViewerPhoto;
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
    transition: "background-color 120ms ease, transform 120ms ease",
    width: 48,
    "&:active": { bgcolor: "#3A3A3A", transform: "scale(0.96)" },
    "&:focus-visible": { outline: `2px solid ${green}`, outlineOffset: 2 },
    "&:hover": { bgcolor: controlBackgroundHover },
};

export const SocialFileViewer: React.FC<SocialFileViewerProps> = ({
    onClose,
    photo,
}) => {
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSocialDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);

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
                color: textBase,
                display: "flex",
                flexDirection: "column",
                inset: 0,
                isolation: "isolate",
                minHeight: "100svh",
                overflow: "hidden",
                position: "fixed",
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
                                color: textSecondary,
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
                        bgcolor: closeControlBackground,
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
                        "linear-gradient(180deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0) 100%)",
                    height: 112,
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
                        "linear-gradient(0deg, rgba(0, 0, 0, 0.48) 0%, rgba(0, 0, 0, 0) 100%)",
                    bottom: 0,
                    height: 140,
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
                    sx={viewerActionButtonSx}
                >
                    <HugeiconsIcon
                        icon={Comment01Icon}
                        size={26}
                        strokeWidth={1.8}
                    />
                </Box>
            </Box>
        </Box>
    );
};
