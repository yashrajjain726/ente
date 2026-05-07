import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";

interface HomeScreenProps {
    profile: SetupProfile;
}

const PlusIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 28, width: 28 }}
    >
        <path
            d="M12 5V19M5 12H19"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
    </Box>
);

export const HomeScreen: React.FC<HomeScreenProps> = ({ profile }) => {
    const initialsSource = profile.fullName.trim() || profile.username.trim();
    const initials = initialsSource
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return (
        <Box
            component="main"
            sx={{
                bgcolor: homeBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: homeBackground,
                    boxSizing: "border-box",
                    minHeight: "100svh",
                    mx: "auto",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 375 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gridTemplateColumns: "40px 1fr 40px",
                        height: 40,
                        mt: "20px",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            color: textBase,
                            display: "flex",
                            height: 40,
                            justifyContent: "flex-start",
                            width: 40,
                        }}
                    >
                        <PlusIcon />
                    </Box>
                    <Box
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            justifySelf: "center",
                            lineHeight: 0,
                        }}
                    >
                        <EnteLogo height={24} />
                    </Box>
                    <Box
                        sx={{
                            alignItems: "center",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            borderRadius: "50%",
                            color: green,
                            display: "flex",
                            height: 24,
                            justifyContent: "center",
                            justifySelf: "flex-end",
                            overflow: "hidden",
                            width: 24,
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
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    objectPosition: "center",
                                    width: "100%",
                                }}
                            />
                        ) : (
                            <Box
                                sx={{
                                    color: green,
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                }}
                            >
                                {initials}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
