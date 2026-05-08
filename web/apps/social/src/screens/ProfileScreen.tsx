import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const profileBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textStrong = "#303030";
const textSoft = "#777777";
const photoGridColumnCount = 4;
const photoGridRadius = "12px";

const samplePhotoUrls = [
    "/images/sample-feed-1.jpg",
    "/images/sample-feed-5.jpg",
    "/images/sample-feed-2.jpg",
    "/images/sample-feed-6.jpg",
    "/images/sample-feed-3.jpg",
    "/images/sample-feed-4.jpg",
] as const;

const sampleMomentDateLabels = [
    "Today",
    "Yesterday",
    "Wed, Apr 29",
    "Tue, Apr 28",
    "Mon, Apr 27",
    "Sun, Apr 26",
    "Sat, Apr 25",
    "Fri, Apr 24",
    "Thu, Apr 23",
    "Wed, Apr 22",
];

const sampleMomentPhotoCounts = [4, 2, 1, 6, 10, 3, 8, 5, 7, 9];

const samplePhotoUrlAt = (index: number): string =>
    samplePhotoUrls[index % samplePhotoUrls.length] ?? samplePhotoUrls[0];

const sampleMomentGroups = sampleMomentDateLabels.map((label, groupIndex) => ({
    label,
    items: Array.from(
        { length: sampleMomentPhotoCounts[groupIndex] ?? 1 },
        (_, itemIndex) => ({
            imageUrl: samplePhotoUrlAt(groupIndex + itemIndex),
        }),
    ),
}));

interface ProfileScreenProps {
    headerVariant?: "owner" | "public";
    onBack?: () => void;
    profile: SetupProfile;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
    headerVariant = "owner",
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
    const momentsSharedCount = sampleMomentGroups.reduce(
        (count, group) => count + group.items.length,
        0,
    );
    const friendsCount = 7;

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
                            ? "1fr"
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
                                width: 58,
                                "& svg": {
                                    display: "block",
                                    overflow: "visible",
                                },
                            }}
                        >
                            <EnteLogo height={18} />
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
                    {!isPublicProfile && (
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
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        px: "16px",
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
                            width: 120,
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
                                    fontSize: 38,
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
                            flexDirection: "column",
                            mt: "14px",
                            minWidth: 0,
                            width: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                color: textStrong,
                                fontFamily:
                                    '"Nunito", "Inter Variable", sans-serif',
                                fontSize: 26,
                                fontWeight: 800,
                                lineHeight: "32px",
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
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 600,
                                lineHeight: "20px",
                                mt: "2px",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {momentsSharedCount} moments · {friendsCount}{" "}
                            friends
                        </Box>
                    </Box>
                </Box>
                {isPublicProfile && (
                    <Box sx={{ mt: "22px", px: "16px", width: "100%" }}>
                        <Box
                            component="button"
                            type="button"
                            onClick={() => {
                                window.location.assign("/");
                            }}
                            sx={{
                                backgroundColor: green,
                                border: 0,
                                borderRadius: "16px",
                                color: "#FFFFFF",
                                cursor: "pointer",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 700,
                                lineHeight: "20px",
                                paddingBlock: "11px",
                                paddingInline: "20px",
                                width: "100%",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { backgroundColor: "#07A820" },
                            }}
                        >
                            Add friend
                        </Box>
                    </Box>
                )}
                <Box
                    component="section"
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        mt: isPublicProfile ? "60px" : "30px",
                        pb: "16px",
                        px: 0,
                        width: "100%",
                    }}
                >
                    {sampleMomentGroups.map((group) => (
                        <Box
                            component="section"
                            key={group.label}
                            sx={{ width: "100%" }}
                        >
                            <Box sx={{ mb: "10px", px: "16px", width: "100%" }}>
                                <Box
                                    component="h2"
                                    sx={{
                                        color: textStrong,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 14,
                                        fontWeight: 650,
                                        letterSpacing: 0,
                                        lineHeight: "20px",
                                        m: 0,
                                    }}
                                >
                                    {group.label}
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    display: "grid",
                                    gap: "3px",
                                    gridTemplateColumns: `repeat(${photoGridColumnCount}, minmax(0, 1fr))`,
                                    px: "16px",
                                    width: "100%",
                                }}
                            >
                                {group.items.map((item, index) => {
                                    const columnIndex =
                                        index % photoGridColumnCount;
                                    const hasPhotoAbove =
                                        index - photoGridColumnCount >= 0;
                                    const hasPhotoBelow =
                                        index + photoGridColumnCount <
                                        group.items.length;
                                    const hasPhotoOnLeft = columnIndex > 0;
                                    const hasPhotoOnRight =
                                        columnIndex <
                                            photoGridColumnCount - 1 &&
                                        index + 1 < group.items.length;

                                    return (
                                        <Box
                                            key={`${group.label}-${item.imageUrl}-${index}`}
                                            sx={{
                                                aspectRatio: "4 / 5",
                                                bgcolor: paleGreen,
                                                borderBottomLeftRadius:
                                                    !hasPhotoBelow &&
                                                    !hasPhotoOnLeft
                                                        ? photoGridRadius
                                                        : 0,
                                                borderBottomRightRadius:
                                                    !hasPhotoBelow &&
                                                    !hasPhotoOnRight
                                                        ? photoGridRadius
                                                        : 0,
                                                borderTopLeftRadius:
                                                    !hasPhotoAbove &&
                                                    !hasPhotoOnLeft
                                                        ? photoGridRadius
                                                        : 0,
                                                borderTopRightRadius:
                                                    !hasPhotoAbove &&
                                                    !hasPhotoOnRight
                                                        ? photoGridRadius
                                                        : 0,
                                                display: "block",
                                                overflow: "hidden",
                                                width: "100%",
                                            }}
                                        >
                                            <Box
                                                component="img"
                                                alt={`${group.label} moment ${
                                                    index + 1
                                                }`}
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
                                    );
                                })}
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
