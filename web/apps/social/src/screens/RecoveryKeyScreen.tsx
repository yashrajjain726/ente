import { Box } from "@mui/material";
import React from "react";

export const recoveryKeyBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textMuted = "#666";
const paleGreen = "#E7F6E9";

const mockRecoveryKeyCardText =
    "Capture your wildest ideas, jot down quirky thoughts, or record memories you want to cherish. Let your imagination run free and splatter your creativity on the page!";

interface RecoveryKeyScreenProps {
    onBack: () => void;
    onNext?: () => void;
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

const PlusIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
    >
        <path
            d="M12 5V19M5 12H19"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </Box>
);

export const RecoveryKeyScreen: React.FC<RecoveryKeyScreenProps> = ({
    onBack,
    onNext,
}) => (
    <Box
        component="main"
        sx={{
            bgcolor: recoveryKeyBackground,
            color: textBase,
            display: "grid",
            minHeight: "100svh",
            overflow: "hidden",
            placeItems: { xs: "stretch", sm: "start center" },
        }}
    >
        <Box
            sx={{
                bgcolor: recoveryKeyBackground,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                minHeight: "100svh",
                mx: "auto",
                pb: "120px",
                px: 3,
                width: "100%",
                "@media (min-width: 600px)": { maxWidth: 375 },
            }}
        >
            <Box
                component="header"
                sx={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr 42px",
                    height: 42,
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
                        height: 42,
                        justifyContent: "flex-start",
                        p: 0,
                        width: 42,
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
                        whiteSpace: "nowrap",
                    }}
                >
                    Recovery Key
                </Box>
                <Box />
            </Box>

            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    flexDirection: "column",
                    gap: "40px",
                    mt: "40px",
                    width: "100%",
                }}
            >
                <Box
                    component="img"
                    alt=""
                    src="/images/recovery-key.svg"
                    sx={{ height: 82, width: 101 }}
                />

                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            gap: "8px",
                            lineHeight: "20px",
                            textAlign: "center",
                            width: "100%",
                        }}
                    >
                        <Box sx={{ color: textBase }}>
                            If you forget your password, the only way you can
                            recover your data is with this key.
                        </Box>
                        <Box
                            sx={{ color: textMuted, mx: "auto", maxWidth: 298 }}
                        >
                            Please save this key in a safe place.
                        </Box>
                    </Box>

                    <Box
                        component="button"
                        type="button"
                        aria-label="Recovery key actions"
                        sx={{
                            bgcolor: green,
                            border: 0,
                            borderRadius: "20px",
                            color: "white",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                            p: "20px",
                            textAlign: "left",
                            width: "100%",
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 3,
                            },
                        }}
                    >
                        <Box
                            sx={{
                                alignItems: "flex-start",
                                display: "flex",
                                gap: "4px",
                                width: "100%",
                            }}
                        >
                            <Box
                                sx={{
                                    flex: "1 1 0",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    minWidth: 0,
                                }}
                            >
                                {mockRecoveryKeyCardText}
                            </Box>
                            <Box
                                sx={{
                                    alignItems: "center",
                                    color: textBase,
                                    display: "flex",
                                    flexShrink: 0,
                                    height: 38,
                                    justifyContent: "center",
                                    width: 38,
                                }}
                            >
                                <PlusIcon />
                            </Box>
                        </Box>
                        <Box
                            sx={{
                                alignItems: "center",
                                alignSelf: "stretch",
                                bgcolor: paleGreen,
                                borderRadius: "20px",
                                color: green,
                                display: "flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 500,
                                height: 48,
                                justifyContent: "center",
                                lineHeight: "20px",
                                px: 3,
                            }}
                        >
                            Share key
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Box
                sx={{
                    bgcolor: recoveryKeyBackground,
                    bottom: 0,
                    boxSizing: "border-box",
                    left: "50%",
                    maxWidth: 375,
                    p: 3,
                    position: "fixed",
                    transform: "translateX(-50%)",
                    width: "100%",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    onClick={onNext}
                    sx={{
                        alignItems: "center",
                        bgcolor: green,
                        border: 0,
                        borderRadius: "20px",
                        color: "white",
                        cursor: onNext ? "pointer" : "default",
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
                        "&:hover": onNext ? { bgcolor: "#07AE22" } : undefined,
                    }}
                >
                    Next
                </Box>
            </Box>
        </Box>
    </Box>
);
