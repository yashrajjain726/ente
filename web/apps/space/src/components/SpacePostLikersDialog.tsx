import { Box, CircularProgress, Dialog, useMediaQuery } from "@mui/material";
import { SpaceAvatarImage } from "components/SpaceAvatarImage";
import { SpaceBottomSheetTransition } from "components/SpaceBottomSheetTransition";
import React from "react";
import type { SpacePostLiker } from "services/space";

const textBase = "#F4F4F4";
const textSecondary = "#A6A6A6";
const lightTextBase = "#000000";
const lightTextSecondary = "#777777";
const dangerColor = "#F63A3A";
const green = "#1DB954";
const sheetBackground = "#1E1E1E";
const lightSheetBackground = "#F2F2F2";
const avatarBackground = "#333333";
const lightAvatarBackground = "#E6E6E6";
const darkBackdropBackground = "rgba(0, 0, 0, 0.86)";
const lightBackdropBackground = "rgba(255, 255, 255, 0.72)";
const likersPanelHeight = "min(180px, 36vh)";

interface SpacePostLikersDialogProps {
    appearance?: "dark" | "light";
    errorMessage?: string | null;
    likers: SpacePostLiker[];
    loading: boolean;
    open: boolean;
    onClose: () => void;
}

export const SpacePostLikersDialog: React.FC<SpacePostLikersDialogProps> = ({
    appearance = "dark",
    errorMessage,
    likers,
    loading,
    open,
    onClose,
}) => {
    const isBottomSheet = useMediaQuery("(max-width: 599px)");
    const isLight = appearance == "light";
    const panelBackground = isLight ? lightSheetBackground : sheetBackground;
    const primaryText = isLight ? lightTextBase : textBase;
    const secondaryText = isLight ? lightTextSecondary : textSecondary;
    const avatarFill = isLight ? lightAvatarBackground : avatarBackground;
    const backdropBackground = isLight
        ? lightBackdropBackground
        : darkBackdropBackground;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            aria-label="Likes"
            slots={
                isBottomSheet
                    ? { transition: SpaceBottomSheetTransition }
                    : undefined
            }
            sx={{
                zIndex: 1500,
                "& .MuiBackdrop-root": {
                    backgroundColor: `${backdropBackground} !important`,
                },
                "& .MuiDialog-container": { backgroundColor: "transparent" },
                "& .MuiPaper-root": {
                    backgroundColor: `${panelBackground} !important`,
                },
            }}
            slotProps={{
                backdrop: { sx: { backgroundColor: backdropBackground } },
                paper: {
                    sx: {
                        bgcolor: panelBackground,
                        backgroundColor: panelBackground,
                        border: 0,
                        borderRadius: "28px 28px 0 0",
                        bottom: 0,
                        boxShadow: "none",
                        boxSizing: "border-box",
                        left: 0,
                        m: 0,
                        maxWidth: "none",
                        p: "24px 20px calc(18px + env(safe-area-inset-bottom))",
                        position: "fixed",
                        width: "100vw",
                        "@media (min-width: 600px)": {
                            borderRadius: "20px",
                            bottom: "auto",
                            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.18)",
                            left: "50%",
                            maxWidth: 342,
                            p: "16px 20px 14px",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 342,
                        },
                    },
                },
            }}
        >
            <Box sx={{ width: "100%" }}>
                <Box sx={{ height: likersPanelHeight, overflowY: "auto" }}>
                    {loading ? (
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                height: "100%",
                                justifyContent: "center",
                            }}
                        >
                            <CircularProgress
                                aria-label="Loading likes"
                                size={24}
                                thickness={4}
                                sx={{ color: green }}
                            />
                        </Box>
                    ) : errorMessage ? (
                        <Box
                            role="alert"
                            sx={{
                                alignItems: "center",
                                color: dangerColor,
                                display: "flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 650,
                                justifyContent: "center",
                                lineHeight: "18px",
                                minHeight: "100%",
                                textAlign: "center",
                            }}
                        >
                            {errorMessage}
                        </Box>
                    ) : likers.length == 0 ? (
                        <Box
                            sx={{
                                alignItems: "center",
                                color: secondaryText,
                                display: "flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 600,
                                justifyContent: "center",
                                lineHeight: "20px",
                                minHeight: "100%",
                                textAlign: "center",
                            }}
                        >
                            No likes yet
                        </Box>
                    ) : (
                        <Box
                            component="ul"
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                listStyle: "none",
                                m: 0,
                                p: 0,
                            }}
                        >
                            {likers.map((liker) => (
                                <SpacePostLikerRow
                                    key={`${liker.profile.id}:${liker.createdAtMs}`}
                                    avatarFill={avatarFill}
                                    liker={liker}
                                    textColor={primaryText}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>
        </Dialog>
    );
};

const SpacePostLikerRow: React.FC<{
    avatarFill: string;
    liker: SpacePostLiker;
    textColor: string;
}> = ({ avatarFill, liker, textColor }) => {
    const profile = liker.profile;
    const displayName =
        profile.fullName.trim() || profile.username.trim() || "Someone";

    return (
        <Box
            component="li"
            sx={{
                alignItems: "center",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "28px minmax(0, 1fr) 24px",
                minHeight: 38,
                py: "4px",
            }}
        >
            <Box
                sx={{
                    bgcolor: avatarFill,
                    borderRadius: "50%",
                    height: 28,
                    overflow: "hidden",
                    width: 28,
                }}
            >
                <SpaceAvatarImage src={profile.avatarUrl} />
            </Box>
            <Box
                sx={{
                    color: textColor,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 650,
                    lineHeight: "20px",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {displayName}
            </Box>
            <Box
                aria-hidden
                className="green-bg"
                component="span"
                sx={filledHeartIconSx}
            />
        </Box>
    );
};

const filledHeartIconSx = {
    display: "block",
    height: 18,
    justifySelf: "center",
    mask: `url("data:image/svg+xml,%3Csvg width='16' height='14' viewBox='0 0 16 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6.63749 12.3742C4.66259 10.885 0.75 7.4804 0.75 4.41664C0.75 2.39161 2.22368 0.75 4.25 0.75C5.3 0.75 6.35 1.10294 7.75 2.51469C9.15 1.10294 10.2 0.75 11.25 0.75C13.2763 0.75 14.75 2.39161 14.75 4.41664C14.75 7.4804 10.8374 10.885 8.86251 12.3742C8.19793 12.8753 7.30207 12.8753 6.63749 12.3742Z' fill='black'/%3E%3C/svg%3E") center / contain no-repeat`,
    WebkitMask: `url("data:image/svg+xml,%3Csvg width='16' height='14' viewBox='0 0 16 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6.63749 12.3742C4.66259 10.885 0.75 7.4804 0.75 4.41664C0.75 2.39161 2.22368 0.75 4.25 0.75C5.3 0.75 6.35 1.10294 7.75 2.51469C9.15 1.10294 10.2 0.75 11.25 0.75C13.2763 0.75 14.75 2.39161 14.75 4.41664C14.75 7.4804 10.8374 10.885 8.86251 12.3742C8.19793 12.8753 7.30207 12.8753 6.63749 12.3742Z' fill='black'/%3E%3C/svg%3E") center / contain no-repeat`,
    width: 20,
};
