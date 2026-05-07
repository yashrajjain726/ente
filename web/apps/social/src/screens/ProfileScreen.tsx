import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Box, Button } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
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
    { gridColumn: "3", gridRow: "1", imageUrl: "/images/sample-feed-2.jpg" },
    { gridColumn: "3", gridRow: "2", imageUrl: "/images/sample-feed-3.jpg" },
    { gridColumn: "1", gridRow: "3", imageUrl: "/images/sample-feed-4.jpg" },
    {
        gridColumn: "2 / span 2",
        gridRow: "3",
        imageUrl: "/images/sample-feed-5.jpg",
    },
    { gridColumn: "1", gridRow: "4", imageUrl: "/images/sample-feed-6.jpg" },
    { gridColumn: "2", gridRow: "4", imageUrl: "/images/sample-feed-2.jpg" },
    { gridColumn: "3", gridRow: "4", imageUrl: "/images/sample-feed-4.jpg" },
    {
        gridColumn: "1 / span 2",
        gridRow: "5",
        imageUrl: "/images/sample-feed-3.jpg",
    },
    { gridColumn: "3", gridRow: "5", imageUrl: "/images/sample-feed-6.jpg" },
    { gridColumn: "1", gridRow: "6", imageUrl: "/images/sample-feed-5.jpg" },
    {
        gridColumn: "2 / span 2",
        gridRow: "6",
        imageUrl: "/images/sample-feed-1.jpg",
    },
];

interface ProfileScreenProps {
    headerVariant?: "owner" | "public";
    onAddToCircle?: () => void;
    onBack?: () => void;
    profile: SetupProfile;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
    headerVariant = "owner",
    onAddToCircle,
    onBack,
    profile,
}) => {
    const isPublicProfile = headerVariant == "public";
    const displayName = profile.fullName.trim() || profile.username.trim();
    const initialsSource = displayName || profile.username.trim();
    const initials = initialsSource
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    const momentsSharedCount = 12;
    const circlePeopleCount = 7;

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
                        gridTemplateColumns: isPublicProfile
                            ? "1fr auto"
                            : "24px 1fr 24px",
                        height: 56,
                        px: 2,
                        py: 0,
                        width: "100%",
                    }}
                >
                    {isPublicProfile ? (
                        <Box
                            sx={{
                                alignSelf: "center",
                                color: textBase,
                                justifySelf: "flex-start",
                                lineHeight: 0,
                                overflow: "visible",
                                width: 65,
                                "& svg": {
                                    display: "block",
                                    overflow: "visible",
                                },
                            }}
                        >
                            <EnteLogo height={20} />
                        </Box>
                    ) : (
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
                    )}
                    {!isPublicProfile && (
                        <Box
                            component="h1"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
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
                    )}
                    {isPublicProfile ? (
                        <Button
                            type="button"
                            onClick={onAddToCircle}
                            sx={{
                                backgroundColor: green,
                                borderRadius: "16px",
                                color: "#FFFFFF",
                                justifySelf: "flex-end",
                                paddingBlock: "11px",
                                paddingInline: "20px",
                                "&:hover": { backgroundColor: "#07A820" },
                            }}
                        >
                            Join circle
                        </Button>
                    ) : (
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
                    )}
                </Box>
                <Box sx={{ bgcolor: divider, height: "1px", width: "100%" }} />

                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        px: "24px",
                        pt: "30px",
                        textAlign: "center",
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
                            justifyContent: "center",
                            overflow: "hidden",
                            width: 118,
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
                                    fontSize: 34,
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
                            color: textStrong,
                            fontFamily:
                                '"Nunito", "Inter Variable", sans-serif',
                            fontSize: 22,
                            fontWeight: 800,
                            lineHeight: "28px",
                            mt: "18px",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {displayName}
                    </Box>
                    <Box
                        sx={{
                            color: textSoft,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 16,
                            fontWeight: 700,
                            lineHeight: "22px",
                            mt: "2px",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        @{profile.username}
                    </Box>
                    <Box
                        sx={{
                            alignItems: "baseline",
                            display: "flex",
                            flexWrap: "wrap",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            gap: "8px",
                            justifyContent: "center",
                            mt: "15px",
                            maxWidth: "100%",
                        }}
                    >
                        <Box
                            component="span"
                            sx={{
                                bgcolor: "#F7F7F7",
                                border: "1px solid rgba(0, 0, 0, 0.04)",
                                borderRadius: "999px",
                                color: textSoft,
                                fontSize: 14,
                                fontWeight: 700,
                                lineHeight: "18px",
                                px: "12px",
                                py: "7px",
                            }}
                        >
                            <Box
                                component="span"
                                sx={{ color: textStrong, fontWeight: 850 }}
                            >
                                {momentsSharedCount}
                            </Box>{" "}
                            shared moments
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                bgcolor: "#F7F7F7",
                                border: "1px solid rgba(0, 0, 0, 0.04)",
                                borderRadius: "999px",
                                color: textSoft,
                                fontSize: 14,
                                fontWeight: 700,
                                lineHeight: "18px",
                                px: "12px",
                                py: "7px",
                            }}
                        >
                            <Box
                                component="span"
                                sx={{ color: textStrong, fontWeight: 850 }}
                            >
                                {circlePeopleCount}
                            </Box>{" "}
                            people in circle
                        </Box>
                    </Box>
                </Box>

                <Box
                    component="section"
                    sx={{ mt: "24px", pb: 0, px: 0, width: "100%" }}
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
