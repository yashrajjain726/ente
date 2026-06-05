import { Box, Dialog, useMediaQuery } from "@mui/material";
import { SpaceBottomSheetTransition } from "components/SpaceBottomSheetTransition";
import React from "react";
import type { SpacePostLiker } from "services/space";

const textBase = "#F4F4F4";
const textSecondary = "#A6A6A6";
const dangerColor = "#F63A3A";
const sheetBackground = "#1E1E1E";
const avatarBackground = "#333333";

interface SpacePostLikersDialogProps {
    errorMessage?: string | null;
    likers: SpacePostLiker[];
    loading: boolean;
    open: boolean;
    onClose: () => void;
}

export const SpacePostLikersDialog: React.FC<SpacePostLikersDialogProps> = ({
    errorMessage,
    likers,
    loading,
    open,
    onClose,
}) => {
    const isBottomSheet = useMediaQuery("(max-width: 599px)");

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
                    backgroundColor: "rgba(0, 0, 0, 0.86) !important",
                },
                "& .MuiDialog-container": { backgroundColor: "transparent" },
                "& .MuiPaper-root": {
                    backgroundColor: `${sheetBackground} !important`,
                },
            }}
            slotProps={{
                backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.86)" } },
                paper: {
                    sx: {
                        bgcolor: sheetBackground,
                        backgroundColor: sheetBackground,
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
                <Box sx={{ maxHeight: "min(420px, 62vh)", overflowY: "auto" }}>
                    {loading ? null : errorMessage ? (
                        <Box
                            role="alert"
                            sx={{
                                color: dangerColor,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 650,
                                lineHeight: "18px",
                                py: "20px",
                                textAlign: "center",
                            }}
                        >
                            {errorMessage}
                        </Box>
                    ) : likers.length == 0 ? (
                        <Box
                            sx={{
                                color: textSecondary,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 600,
                                lineHeight: "20px",
                                py: "20px",
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
                                    liker={liker}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>
        </Dialog>
    );
};

const SpacePostLikerRow: React.FC<{ liker: SpacePostLiker }> = ({ liker }) => {
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
                gridTemplateColumns: "32px minmax(0, 1fr) 24px",
                minHeight: 42,
                py: "4px",
            }}
        >
            <Box
                sx={{
                    bgcolor: avatarBackground,
                    borderRadius: "50%",
                    height: 32,
                    overflow: "hidden",
                    width: 32,
                }}
            >
                {profile.avatarUrl ? (
                    <Box
                        component="img"
                        alt=""
                        src={profile.avatarUrl}
                        sx={{
                            display: "block",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center",
                            width: "100%",
                        }}
                    />
                ) : null}
            </Box>
            <Box
                sx={{
                    color: textBase,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 15,
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
