import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React from "react";

export const onboardingGreen = "#08C225";
export const onboardingTitle = "Share your life";
export const onboardingDescription =
    "A truly private, beautiful way to share your life with friends and family";
export const addFriendOnboardingTitle = "Follow their life";
export const addFriendOnboardingDescription =
    "A truly private, beautiful way to see everyday moments from your friends and family";

const softGreen = "#E7F6E9";
const copyGreen = "#AAFFB8";

interface ActionButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant: "primary" | "secondary";
}

const ActionButton: React.FC<ActionButtonProps> = ({
    children,
    onClick,
    variant,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: variant == "primary" ? "black" : softGreen,
            border: 0,
            borderRadius: "20px",
            color: variant == "primary" ? "white" : onboardingGreen,
            cursor: "pointer",
            display: "flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            height: 48,
            justifyContent: "center",
            lineHeight: "20px",
            p: "14px 24px",
            textDecoration: "none",
            width: "100%",
            "&:focus-visible": {
                outline: "2px solid rgba(255 255 255 / 0.88)",
                outlineOffset: 3,
            },
            "&:hover": {
                bgcolor: variant == "primary" ? "#121212" : "#DDF2E0",
            },
        }}
    >
        {children}
    </Box>
);

interface OnboardingScreenProps {
    description?: string;
    onCreateAccount: () => void;
    onLogin?: () => void;
    title?: string;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
    description = onboardingDescription,
    onCreateAccount,
    onLogin,
    title = onboardingTitle,
}) => (
    <Box
        className="green-bg"
        component="main"
        sx={{
            bgcolor: onboardingGreen,
            color: "white",
            display: "grid",
            minHeight: "100svh",
            overflow: "hidden",
            placeItems: { xs: "stretch", sm: "start center" },
        }}
    >
        <Box
            className="green-bg"
            sx={{
                alignItems: "center",
                bgcolor: onboardingGreen,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                minHeight: "max(100svh, 812px)",
                mx: "auto",
                overflow: "hidden",
                px: 3,
                width: "100%",
                "@media (min-width: 600px)": {
                    maxWidth: 390,
                    minHeight: "100svh",
                },
                "@media (max-height: 760px)": { minHeight: "100svh" },
            }}
        >
            <Box
                component="header"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    flexShrink: 0,
                    gridTemplateColumns: "40px 1fr 40px",
                    height: 40,
                    mt: "44px",
                    width: "100%",
                }}
            >
                <Box />
                <Box
                    sx={{
                        color: "white",
                        justifySelf: "center",
                        lineHeight: 0,
                    }}
                >
                    <EnteLogo height={24} />
                </Box>
                <Box />
            </Box>
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    flexDirection: "column",
                    flexShrink: 0,
                    width: "100%",
                    "@media (min-width: 600px)": {
                        flex: "1 1 auto",
                        justifyContent: "center",
                        minHeight: 0,
                    },
                }}
            >
                <Box
                    component="img"
                    alt=""
                    src="/images/share-memories.svg"
                    sx={{
                        flexShrink: 0,
                        height: 245.189,
                        mt: "112px",
                        width: 282,
                        "@media (max-height: 760px)": {
                            height: 219,
                            mt: "68px",
                            width: 252,
                        },
                        "@media (max-width: 340px)": {
                            height: "auto",
                            width: "76vw",
                        },
                        "@media (min-width: 600px)": { mt: 0 },
                    }}
                />
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        flexShrink: 0,
                        mt: "92px",
                        textAlign: "center",
                        "@media (max-height: 760px)": { mt: "60px" },
                    }}
                >
                    <Box
                        component="h1"
                        sx={{
                            fontFamily: "Nunito, sans-serif",
                            fontSize: 24,
                            fontWeight: 800,
                            letterSpacing: 0,
                            lineHeight: "29px",
                            m: 0,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {title}
                    </Box>
                    <Box
                        component="p"
                        sx={{
                            color: copyGreen,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: "20px",
                            m: 0,
                            mt: "12px",
                            maxWidth: 314,
                        }}
                    >
                        {description}
                    </Box>
                </Box>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    flexShrink: 0,
                    gap: "12px",
                    mt: "52px",
                    width: "100%",
                    "@media (max-height: 760px)": { mt: "40px" },
                    "@media (min-width: 600px)": { mb: "44px", mt: 0 },
                }}
            >
                <ActionButton variant="primary" onClick={onCreateAccount}>
                    Create an Ente account
                </ActionButton>
                <ActionButton variant="secondary" onClick={onLogin}>
                    Login to existing account
                </ActionButton>
            </Box>
        </Box>
    </Box>
);
