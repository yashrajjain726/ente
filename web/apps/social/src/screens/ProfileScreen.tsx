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
const coverForeground = "#FFFFFF";
const profileHeaderHeight = 56;
const profileAvatarTopOffset = 54;
const profileAvatarSize = 120;
const profileCoverHeight =
    profileHeaderHeight + profileAvatarTopOffset + profileAvatarSize / 2;
const photoMasonryGap = "3px";
const photoMasonryRadius = "12px";

const samplePhotoUrls = [
    "/images/sample-feed-1.jpg",
    "/images/sample-feed-5.jpg",
    "/images/sample-feed-2.jpg",
    "/images/sample-feed-6.jpg",
    "/images/sample-feed-3.jpg",
    "/images/sample-feed-4.jpg",
] as const;

const samplePhotoAspectRatios = [1.32, 0.82, 1.18, 0.92, 1.46, 1.04] as const;

const samplePostDateLabels = [
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

const samplePostPhotoCounts = [4, 2, 1, 6, 10, 3, 8, 5, 7, 9];

const samplePhotoUrlAt = (index: number): string =>
    samplePhotoUrls[index % samplePhotoUrls.length] ?? samplePhotoUrls[0];

const samplePhotoAspectRatioAt = (index: number): number =>
    samplePhotoAspectRatios[index % samplePhotoAspectRatios.length] ?? 1;

const samplePostGroups = samplePostDateLabels.map((label, groupIndex) => ({
    label,
    items: Array.from(
        { length: samplePostPhotoCounts[groupIndex] ?? 1 },
        (_, itemIndex) => ({
            imageUrl: samplePhotoUrlAt(groupIndex + itemIndex),
            aspectRatio: samplePhotoAspectRatioAt(groupIndex + itemIndex),
        }),
    ),
}));

type SamplePostItem = (typeof samplePostGroups)[number]["items"][number];

interface PostMasonryRow {
    height: number;
    compactHeight: number;
    items: { item: SamplePostItem; index: number }[];
}

const postMasonryRowSizes = (count: number): number[] => {
    if (count <= 0) return [];
    if (count <= 3) return [count];

    const rowSizes: number[] = [];
    let remaining = count;

    while (remaining > 0) {
        if (remaining == 2 || remaining == 3) {
            rowSizes.push(remaining);
            break;
        }
        if (remaining == 4) {
            rowSizes.push(2, 2);
            break;
        }
        if (remaining == 5) {
            rowSizes.push(3, 2);
            break;
        }

        const nextRowSize = rowSizes.length % 2 == 0 ? 3 : 2;
        rowSizes.push(nextRowSize);
        remaining -= nextRowSize;
    }

    return rowSizes;
};

const postMasonryRowHeight = (rowSize: number, rowIndex: number) => {
    if (rowSize <= 1) return 190;
    if (rowSize == 2) return rowIndex % 2 == 0 ? 152 : 142;
    return rowIndex % 2 == 0 ? 116 : 108;
};

const buildPostMasonryRows = (items: SamplePostItem[]): PostMasonryRow[] => {
    const rowSizes = postMasonryRowSizes(items.length);
    let nextItemIndex = 0;

    return rowSizes.map((rowSize, rowIndex) => {
        const rowItems = items
            .slice(nextItemIndex, nextItemIndex + rowSize)
            .map((item, rowItemIndex) => ({
                item,
                index: nextItemIndex + rowItemIndex,
            }));
        nextItemIndex += rowSize;

        const height = postMasonryRowHeight(rowItems.length, rowIndex);
        return {
            height,
            compactHeight: Math.round(height * 0.9),
            items: rowItems,
        };
    });
};

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
    const postsSharedCount = samplePostGroups.reduce(
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
                    overflow: "hidden",
                    position: "relative",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 375 },
                }}
            >
                <Box
                    className="green-bg-with-noise-and-curves"
                    sx={{
                        height: profileCoverHeight,
                        insetInline: 0,
                        position: "absolute",
                        top: 0,
                        width: "100%",
                        zIndex: 0,
                    }}
                />
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        color: coverForeground,
                        display: "grid",
                        gridTemplateColumns: isPublicProfile
                            ? "1fr auto"
                            : "24px 1fr 24px",
                        height: profileHeaderHeight,
                        position: "relative",
                        px: 2,
                        py: 0,
                        width: "100%",
                        zIndex: 1,
                    }}
                >
                    {isPublicProfile ? (
                        <Box
                            sx={{
                                alignSelf: "center",
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
                                color: "inherit",
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
                    {isPublicProfile && (
                        <Box
                            component="button"
                            type="button"
                            onClick={() => {
                                window.location.assign("/");
                            }}
                            sx={{
                                alignItems: "center",
                                backgroundColor: "#FFFFFF",
                                border: 0,
                                borderRadius: "999px",
                                color: green,
                                cursor: "pointer",
                                display: "inline-flex",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 700,
                                height: 36,
                                justifyContent: "center",
                                justifySelf: "flex-end",
                                lineHeight: "18px",
                                minWidth: 0,
                                paddingInline: "16px",
                                whiteSpace: "nowrap",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { backgroundColor: "#F3FFF5" },
                            }}
                        >
                            Add friend
                        </Box>
                    )}
                    {!isPublicProfile && (
                        <Box
                            component="h1"
                            sx={{
                                color: "inherit",
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
                                color: "inherit",
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
                        position: "relative",
                        pt: `${profileAvatarTopOffset}px`,
                        textAlign: "center",
                        width: "100%",
                        zIndex: 1,
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            aspectRatio: "1 / 1",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: "4px solid #FFFFFF",
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            color: green,
                            display: "flex",
                            justifyContent: "center",
                            overflow: "hidden",
                            width: profileAvatarSize,
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
                            {postsSharedCount} posts · {friendsCount}{" "}
                            friends
                        </Box>
                    </Box>
                </Box>
                <Box
                    component="section"
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        mt: "42px",
                        pb: "16px",
                        px: 0,
                        width: "100%",
                    }}
                >
                    {samplePostGroups.map((group) => (
                        <Box
                            component="section"
                            key={group.label}
                            sx={{ width: "100%" }}
                        >
                            <Box sx={{ mb: "10px", px: "18px", width: "100%" }}>
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
                                    borderRadius: photoMasonryRadius,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: photoMasonryGap,
                                    mx: "16px",
                                    overflow: "hidden",
                                    width: "calc(100% - 32px)",
                                }}
                            >
                                {buildPostMasonryRows(group.items).map(
                                    (row, rowIndex) => (
                                        <Box
                                            key={`${group.label}-row-${rowIndex}`}
                                            sx={{
                                                display: "flex",
                                                gap: photoMasonryGap,
                                                height: row.height,
                                                width: "100%",
                                                "@media (max-width: 340px)": {
                                                    height: row.compactHeight,
                                                },
                                            }}
                                        >
                                            {row.items.map(({ item, index }) => (
                                                <Box
                                                    key={`${group.label}-${item.imageUrl}-${index}`}
                                                    sx={{
                                                        bgcolor: paleGreen,
                                                        display: "block",
                                                        flex: `${item.aspectRatio} 1 0`,
                                                        minWidth: 0,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <Box
                                                        component="img"
                                                        alt={`${group.label} post ${
                                                            index + 1
                                                        }`}
                                                        src={item.imageUrl}
                                                        sx={{
                                                            display: "block",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                            objectPosition:
                                                                "center",
                                                            width: "100%",
                                                        }}
                                                    />
                                                </Box>
                                            ))}
                                        </Box>
                                    ),
                                )}
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
