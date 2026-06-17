import { Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Skeleton } from "@mui/material";
import { SpaceAvatarImage } from "components/SpaceAvatarImage";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const shareProfileLinkBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textMuted = "#666";
const avatarSkeletonBackground = "#E6E6E6";
const headerHeight = 64;
const headerSideWidth = 32;

interface ShareProfileLinkScreenProps {
    errorMessage?: string;
    onDone?: () => void;
    onRetry?: () => void;
    profile: SetupProfile;
    profileLink?: string;
}

export const ShareIcon: React.FC<{ strokeWidth?: number }> = ({
    strokeWidth = 1.8,
}) => <HugeiconsIcon icon={Share08Icon} size={18} strokeWidth={strokeWidth} />;

export const ShareProfileLinkScreen: React.FC<ShareProfileLinkScreenProps> = ({
    errorMessage,
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
                    pb: "156px",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        bgcolor: shareProfileLinkBackground,
                        boxSizing: "border-box",
                        display: "grid",
                        gap: "12px",
                        gridTemplateColumns: `${headerSideWidth}px minmax(0, 1fr) ${headerSideWidth}px`,
                        height: headerHeight + 4,
                        left: "50%",
                        maxWidth: "100%",
                        pb: 2,
                        position: "fixed",
                        pt: 2,
                        px: 2,
                        top: 0,
                        transform: "translateX(-50%)",
                        width: "100%",
                        zIndex: 4,
                        "@media (min-width: 600px)": { maxWidth: 390 },
                    }}
                >
                    <Box />
                    <Box
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            justifySelf: "center",
                            lineHeight: 0,
                            minWidth: 0,
                            overflow: "visible",
                            placeSelf: "center",
                            width: 61,
                        }}
                    >
                        <Box
                            component="img"
                            alt="Space"
                            src="/images/space.svg"
                            sx={{
                                display: "block",
                                filter: "invert(1)",
                                height: 18,
                                width: "auto",
                            }}
                        />
                    </Box>
                    <Box />
                </Box>
                <Box aria-hidden sx={{ height: headerHeight + 4 }} />
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flex: "1 1 auto",
                        flexDirection: "column",
                        justifyContent: "center",
                        maxWidth: "100%",
                        minHeight: 0,
                        minWidth: 0,
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
                            height: 176,
                            justifyContent: "center",
                            overflow: "hidden",
                            width: 176,
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
                            fontSize: 24,
                            fontWeight: 600,
                            lineHeight: "32px",
                            m: 0,
                            mt: "24px",
                            textAlign: "center",
                        }}
                    >
                        Welcome, {displayName}
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
                        Invite your friends and family to follow your life
                    </Box>
                </Box>

                <Box
                    sx={{
                        bgcolor: shareProfileLinkBackground,
                        bottom: 0,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        left: "50%",
                        maxWidth: 390,
                        p: "16px 24px calc(20px + env(safe-area-inset-bottom))",
                        position: "fixed",
                        transform: "translateX(-50%)",
                        width: "100%",
                    }}
                >
                    <Box
                        className="green-bg"
                        component="button"
                        type="button"
                        disabled={!profileLink}
                        onClick={shareProfileLink}
                        sx={{
                            alignItems: "center",
                            bgcolor: green,
                            border: 0,
                            borderRadius: "20px",
                            color: "white",
                            cursor: profileLink ? "pointer" : "default",
                            display: "flex",
                            gap: "10px",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            height: 48,
                            justifyContent: "center",
                            lineHeight: "20px",
                            p: "14px 24px",
                            width: "100%",
                            "&:disabled": { opacity: 0.56 },
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 3,
                            },
                            "&:hover": profileLink
                                ? { bgcolor: "#07AE22" }
                                : undefined,
                        }}
                    >
                        <ShareIcon strokeWidth={2} />
                        {copied ? "Copied" : "Share invite"}
                    </Box>
                    {onDone && (
                        <Box
                            component="button"
                            type="button"
                            onClick={onDone}
                            sx={{
                                alignItems: "center",
                                bgcolor: "#F5F5F5",
                                border: 0,
                                borderRadius: "20px",
                                color: textMuted,
                                cursor: "pointer",
                                display: "flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 600,
                                height: 48,
                                justifyContent: "center",
                                lineHeight: "20px",
                                p: "14px 24px",
                                width: "100%",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { bgcolor: "#EFEFEF" },
                            }}
                        >
                            Done
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
};
