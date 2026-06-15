import { Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import { SpaceAvatarImage } from "components/SpaceAvatarImage";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { spaceTouchTargetSize } from "styles/touchTargets";

export const shareProfileLinkBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textMuted = "#666";
const textLight = "#969696";
const avatarSkeletonBackground = "#E6E6E6";
const iconFill = "#F0F0F0";
const actionRowHover = "#F5F5F5";

interface ShareProfileLinkScreenProps {
    errorMessage?: string;
    isLinkLoading?: boolean;
    onBack: () => void;
    onDone?: () => void;
    onRetry?: () => void;
    profile: SetupProfile;
    profileLink?: string;
}

interface ActionRowProps {
    label: string;
    onClick: () => void;
    startIcon: React.ReactNode;
    status?: string;
}

const BackIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 24, width: 24 }}
    >
        <path
            d="M15 6L9 12L15 18"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </Box>
);

export const ShareIcon: React.FC<{ strokeWidth?: number }> = ({
    strokeWidth = 1.8,
}) => <HugeiconsIcon icon={Share08Icon} size={18} strokeWidth={strokeWidth} />;

export const LinkIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 20, width: 20 }}
    >
        <path
            d="M9.75 14.25L14.25 9.75M10.75 7.5L11.8 6.45C13.25 5 15.65 5 17.1 6.45C18.55 7.9 18.55 10.3 17.1 11.75L15.75 13.1M13.25 16.5L12.2 17.55C10.75 19 8.35 19 6.9 17.55C5.45 16.1 5.45 13.7 6.9 12.25L8.25 10.9"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
    </Box>
);

const ChevronIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 22, width: 22 }}
    >
        <path
            d="M9 6L15 12L9 18"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </Box>
);

const ActionRow: React.FC<ActionRowProps> = ({
    label,
    onClick,
    startIcon,
    status,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: "white",
            border: 0,
            borderRadius: "16px",
            boxSizing: "border-box",
            color: textBase,
            cursor: "pointer",
            display: "flex",
            gap: "14px",
            height: 56,
            maxWidth: "100%",
            minWidth: 0,
            p: "8px 12px",
            textAlign: "left",
            width: "100%",
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
            "&:hover": { bgcolor: actionRowHover },
        }}
    >
        <Box
            sx={{
                alignItems: "center",
                bgcolor: iconFill,
                borderRadius: "50%",
                color: textBase,
                display: "flex",
                flexShrink: 0,
                height: 38,
                justifyContent: "center",
                width: 38,
            }}
        >
            {startIcon}
        </Box>
        <Box
            sx={{
                flex: "1 1 0",
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: "20px",
                minWidth: 0,
            }}
        >
            {label}
        </Box>
        {status && (
            <Box
                sx={{
                    color: green,
                    flexShrink: 0,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: "16px",
                }}
            >
                {status}
            </Box>
        )}
        <Box sx={{ color: textBase, display: "flex", flexShrink: 0 }}>
            <ChevronIcon />
        </Box>
    </Box>
);

export const ShareProfileLinkScreen: React.FC<ShareProfileLinkScreenProps> = ({
    errorMessage,
    isLinkLoading = false,
    onBack,
    onDone,
    onRetry,
    profile,
    profileLink,
}) => {
    const [copied, setCopied] = useState(false);
    const displayName = profile.fullName.trim() || profile.username.trim();

    const copyProfileLink = async () => {
        if (!profileLink) return;
        await navigator.clipboard.writeText(profileLink);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    const shareProfileLink = async () => {
        if (!profileLink) return;
        const shareData = { url: profileLink };

        if (typeof navigator.share == "function") {
            try {
                await navigator.share(shareData);
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name == "AbortError")
                    return;
            }
        }

        await copyProfileLink();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: shareProfileLinkBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: shareProfileLinkBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100svh",
                    minWidth: 0,
                    mx: "auto",
                    overflowX: "hidden",
                    pb: "120px",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `${spaceTouchTargetSize}px minmax(0, 1fr) ${spaceTouchTargetSize}px`,
                        height: spaceTouchTargetSize,
                        minWidth: 0,
                        mt: "32px",
                        width: "100%",
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back"
                        onClick={onBack}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: "pointer",
                            display: "flex",
                            height: spaceTouchTargetSize,
                            justifyContent: "flex-start",
                            p: 0,
                            width: spaceTouchTargetSize,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <BackIcon />
                    </Box>
                    <Box
                        component="h1"
                        sx={{
                            alignSelf: "center",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 20,
                            fontWeight: 600,
                            justifySelf: "center",
                            lineHeight: "28px",
                            m: 0,
                            minWidth: 0,
                            whiteSpace: "nowrap",
                        }}
                    >
                        Invite people
                    </Box>
                    <Box />
                </Box>

                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        maxWidth: "100%",
                        minWidth: 0,
                        mt: "32px",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            aspectRatio: "1 / 1",
                            bgcolor: avatarSkeletonBackground,
                            borderRadius: "50%",
                            display: "flex",
                            height: 112,
                            justifyContent: "center",
                            overflow: "hidden",
                            width: 112,
                        }}
                    >
                        {profile.avatarUrl || !profile.avatarObjectKey ? (
                            <SpaceAvatarImage src={profile.avatarUrl} />
                        ) : (
                            <Skeleton
                                variant="circular"
                                sx={{
                                    bgcolor: avatarSkeletonBackground,
                                    height: "100%",
                                    transform: "none",
                                    width: "100%",
                                }}
                            />
                        )}
                    </Box>

                    <Box
                        component="h2"
                        sx={{
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 18,
                            fontWeight: 600,
                            lineHeight: "24px",
                            m: 0,
                            mt: "18px",
                            textAlign: "center",
                        }}
                    >
                        {displayName}
                    </Box>
                    <Box
                        sx={{
                            color: textMuted,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: "20px",
                            mt: "4px",
                            textAlign: "center",
                        }}
                    >
                        @{profile.username}
                    </Box>
                    <Box
                        sx={{
                            bgcolor: "white",
                            borderRadius: "16px",
                            boxSizing: "border-box",
                            color: textLight,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: "18px",
                            maxWidth: "100%",
                            minWidth: 0,
                            mt: "20px",
                            overflow: "hidden",
                            px: 2,
                            py: "13px",
                            textAlign: "center",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            width: "100%",
                        }}
                    >
                        {isLinkLoading
                            ? "Creating invite link..."
                            : profileLink || "Invite link unavailable"}
                    </Box>
                    {errorMessage && (
                        <Box
                            component="button"
                            type="button"
                            onClick={onRetry}
                            sx={{
                                bgcolor: "transparent",
                                border: 0,
                                color: green,
                                cursor: onRetry ? "pointer" : "default",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: "18px",
                                mt: "10px",
                                p: 0,
                            }}
                        >
                            {errorMessage}
                        </Box>
                    )}
                    <Box
                        component="p"
                        sx={{
                            color: textMuted,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: "20px",
                            m: 0,
                            maxWidth: "100%",
                            minWidth: 0,
                            mt: "12px",
                            overflowWrap: "break-word",
                            textAlign: "center",
                            width: "100%",
                        }}
                    >
                        Invite your friends and family to follow your life.
                        Only you and the people you share this link with can
                        see your posts.
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        maxWidth: "100%",
                        minWidth: 0,
                        mt: "34px",
                        width: "100%",
                    }}
                >
                    <ActionRow
                        label="Share"
                        onClick={shareProfileLink}
                        startIcon={<ShareIcon />}
                    />
                    <ActionRow
                        label="Copy link"
                        onClick={copyProfileLink}
                        startIcon={<LinkIcon />}
                        status={copied ? "Copied" : undefined}
                    />
                </Box>

                <Box
                    sx={{
                        bgcolor: shareProfileLinkBackground,
                        bottom: 0,
                        boxSizing: "border-box",
                        left: "50%",
                        maxWidth: 390,
                        p: 3,
                        position: "fixed",
                        transform: "translateX(-50%)",
                        width: "100%",
                    }}
                >
                    <Box
                        className="green-bg"
                        component="button"
                        type="button"
                        onClick={onDone}
                        sx={{
                            alignItems: "center",
                            bgcolor: green,
                            border: 0,
                            borderRadius: "20px",
                            color: "white",
                            cursor: onDone ? "pointer" : "default",
                            display: "flex",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            height: 48,
                            justifyContent: "center",
                            lineHeight: "20px",
                            p: "14px 24px",
                            width: "100%",
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 3,
                            },
                            "&:hover": onDone
                                ? { bgcolor: "#07AE22" }
                                : undefined,
                        }}
                    >
                        Done
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
