import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Box } from "@mui/material";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const profileBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textStrong = "#303030";
const textSoft = "#777777";
const divider = "rgba(0, 0, 0, 0.08)";

const sampleMomentItems = [
    {
        gridColumn: "1 / span 2",
        gridRow: "1 / span 2",
        imageUrl: "/images/sample-feed-1.jpg",
    },
    {
        gridColumn: "3",
        gridRow: "1",
        imageUrl: "/images/sample-feed-2.jpg",
    },
    {
        gridColumn: "3",
        gridRow: "2",
        imageUrl: "/images/sample-feed-3.jpg",
    },
    {
        gridColumn: "1",
        gridRow: "3",
        imageUrl: "/images/sample-feed-4.jpg",
    },
    {
        gridColumn: "2 / span 2",
        gridRow: "3",
        imageUrl: "/images/sample-feed-5.jpg",
    },
    {
        gridColumn: "1",
        gridRow: "4",
        imageUrl: "/images/sample-feed-6.jpg",
    },
    {
        gridColumn: "2",
        gridRow: "4",
        imageUrl: "/images/sample-feed-2.jpg",
    },
    {
        gridColumn: "3",
        gridRow: "4",
        imageUrl: "/images/sample-feed-4.jpg",
    },
    {
        gridColumn: "1 / span 2",
        gridRow: "5",
        imageUrl: "/images/sample-feed-3.jpg",
    },
    {
        gridColumn: "3",
        gridRow: "5",
        imageUrl: "/images/sample-feed-6.jpg",
    },
    {
        gridColumn: "1",
        gridRow: "6",
        imageUrl: "/images/sample-feed-5.jpg",
    },
    {
        gridColumn: "2 / span 2",
        gridRow: "6",
        imageUrl: "/images/sample-feed-1.jpg",
    },
];

interface ProfileScreenProps {
    onBack: () => void;
    profile: SetupProfile;
}

interface StatProps {
    label: string;
    value: string;
}

const Stat: React.FC<StatProps> = ({ label, value }) => (
    <Box sx={{ minWidth: 0 }}>
        <Box
            sx={{
                color: textStrong,
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 15,
                fontWeight: 800,
                lineHeight: "19px",
            }}
        >
            {value}
        </Box>
        <Box
            sx={{
                color: textSoft,
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 13,
                fontWeight: 650,
                lineHeight: "17px",
                mt: "1px",
            }}
        >
            {label}
        </Box>
    </Box>
);

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
    onBack,
    profile,
}) => {
    const displayName = profile.fullName.trim() || profile.username.trim();
    const initialsSource = displayName || profile.username.trim();
    const initials = initialsSource
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return (
        <Box
            component="main"
            sx={{
                bgcolor: profileBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: profileBackground,
                    boxSizing: "border-box",
                    minHeight: "100svh",
                    mx: "auto",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 375 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gridTemplateColumns: "24px 1fr 24px",
                        p: 2,
                        width: "100%",
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back to home"
                        onClick={onBack}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: "pointer",
                            display: "flex",
                            height: 24,
                            justifyContent: "flex-start",
                            p: 0,
                            width: 24,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <ArrowBackRoundedIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Box
                        component="h1"
                        sx={{
                            color: textBase,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 18,
                            fontWeight: 700,
                            justifySelf: "center",
                            lineHeight: "24px",
                            m: 0,
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {profile.username}
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label="Settings"
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: "pointer",
                            display: "flex",
                            height: 24,
                            justifyContent: "flex-end",
                            p: 0,
                            width: 24,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <SettingsRoundedIcon sx={{ fontSize: 22 }} />
                    </Box>
                </Box>
                <Box sx={{ bgcolor: divider, height: "1px", width: "100%" }} />

                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "22px",
                        px: "14px",
                        pt: "24px",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            aspectRatio: "1 / 1",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            borderRadius: "50%",
                            color: green,
                            display: "flex",
                            flexShrink: 0,
                            height: 86,
                            justifyContent: "center",
                            overflow: "hidden",
                            width: 86,
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
                        ) : (
                            <Box
                                sx={{
                                    color: green,
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 27,
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
                            display: "flex",
                            flex: "1 1 0",
                            flexDirection: "column",
                            minWidth: 0,
                        }}
                    >
                        <Box
                            sx={{
                                color: textStrong,
                                fontFamily: '"Inter Variable", Inter, sans-serif',
                                fontSize: 15,
                                fontWeight: 750,
                                lineHeight: "19px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {displayName}
                        </Box>
                        <Box
                            sx={{
                                alignItems: "flex-start",
                                display: "grid",
                                gap: "12px",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                mt: "16px",
                                width: "100%",
                            }}
                        >
                            <Stat label="moments" value="12" />
                            <Stat label="followers" value="7" />
                            <Stat label="following" value="10" />
                        </Box>
                    </Box>
                </Box>

                <Box
                    component="section"
                    sx={{
                        mt: "24px",
                        pb: 0,
                        px: 0,
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            aspectRatio: "1 / 2",
                            display: "grid",
                            gap: "1px",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gridTemplateRows: "repeat(6, 1fr)",
                            width: "100%",
                        }}
                    >
                        {sampleMomentItems.map((item, index) => (
                            <Box
                                key={`${item.imageUrl}-${index}`}
                                sx={{
                                    bgcolor: paleGreen,
                                    display: "block",
                                    gridColumn: item.gridColumn,
                                    gridRow: item.gridRow,
                                    height: "100%",
                                    overflow: "hidden",
                                    width: "100%",
                                }}
                            >
                                <Box
                                    component="img"
                                    alt={`My moment ${index + 1}`}
                                    src={item.imageUrl}
                                    sx={{
                                        display: "block",
                                        height: "100%",
                                        objectFit: "cover",
                                        objectPosition: "center",
                                        width: "100%",
                                    }}
                                />
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
