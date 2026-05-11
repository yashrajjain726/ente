import { Box } from "@mui/material";
import {
    SocialFileViewer,
    type SocialViewerPhoto,
} from "components/SocialFileViewer";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useState } from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { firstNameFrom, formatSocialDate } from "utils/socialDisplay";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textSecondary = "#6B6B6B";

const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);
const sampleFeedPhotoAspectRatio = 900 / 680;

const sampleFeedItems = [
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        imageUrl: "/images/sample-feed-1.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: minutesAgo(22),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Mira Sen",
        timestampMs: hoursAgo(3),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        imageUrl: "/images/sample-feed-3.jpg",
        name: "Nikhil Rao",
        timestampMs: daysAgo(1),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-6.jpg",
        imageUrl: "/images/sample-feed-4.jpg",
        name: "Riya Kapoor",
        timestampMs: daysAgo(2),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-4.jpg",
        imageUrl: "/images/sample-feed-5.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(4),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-3.jpg",
        imageUrl: "/images/sample-feed-6.jpg",
        name: "Mira Sen",
        timestampMs: daysAgo(8),
    },
    {
        aspectRatio: sampleFeedPhotoAspectRatio,
        avatarUrl: "/images/sample-feed-5.jpg",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Nikhil Rao",
        timestampMs: new Date(new Date().getFullYear() - 1, 10, 18).getTime(),
    },
];

interface HomeScreenProps {
    onOpenProfile?: () => void;
    profile: SetupProfile;
}

interface FeedItemProps {
    aspectRatio: number;
    avatarUrl: string;
    imageUrl: string;
    name: string;
    onOpenPhoto?: (photo: SocialViewerPhoto) => void;
    timestampMs: number;
}

const PlusIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="4 4 16 16"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
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

const FeedItem: React.FC<FeedItemProps> = ({
    aspectRatio,
    avatarUrl,
    imageUrl,
    name,
    onOpenPhoto,
    timestampMs,
}) => {
    const firstName = firstNameFrom(name);
    const dateLabel = formatSocialDate(timestampMs);

    return (
        <Box
            component="article"
            sx={{ display: "flex", flexDirection: "column", width: "100%" }}
        >
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    gap: "10px",
                    mb: "10px",
                    minHeight: 32,
                    px: "20px",
                    width: "100%",
                }}
            >
                <Box
                    sx={{
                        bgcolor: paleGreen,
                        borderRadius: "50%",
                        flexShrink: 0,
                        height: 28,
                        overflow: "hidden",
                        width: 28,
                    }}
                >
                    <Box
                        component="img"
                        alt=""
                        src={avatarUrl}
                        sx={{
                            display: "block",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center",
                            width: "100%",
                        }}
                    />
                </Box>
                <Box
                    sx={{
                        alignItems: "baseline",
                        color: textBase,
                        display: "flex",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        gap: "4px",
                        lineHeight: "20px",
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                    }}
                >
                    <Box
                        component="span"
                        sx={{
                            fontWeight: 650,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {firstName}
                    </Box>
                    <Box
                        component="span"
                        aria-hidden
                        sx={{
                            color: textSecondary,
                            flexShrink: 0,
                            fontWeight: 500,
                        }}
                    >
                        ·
                    </Box>
                    <Box
                        component="time"
                        dateTime={new Date(timestampMs).toISOString()}
                        sx={{
                            color: textSecondary,
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 500,
                        }}
                    >
                        {dateLabel}
                    </Box>
                </Box>
            </Box>
            <Box
                component="button"
                type="button"
                aria-label={`Open ${name} photo`}
                onClick={() =>
                    onOpenPhoto?.({
                        alt: `${name} post`,
                        avatarUrl,
                        imageUrl,
                        name,
                        timestampMs,
                    })
                }
                sx={{
                    appearance: "none",
                    aspectRatio,
                    bgcolor: paleGreen,
                    border: 0,
                    borderRadius: "20px",
                    display: "block",
                    cursor: onOpenPhoto ? "pointer" : "default",
                    mx: "16px",
                    overflow: "hidden",
                    p: 0,
                    width: "calc(100% - 32px)",
                    "&:focus-visible": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 2,
                    },
                }}
            >
                <Box
                    component="img"
                    alt={`${name} post`}
                    src={imageUrl}
                    sx={{
                        display: "block",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center",
                        width: "100%",
                    }}
                />
            </Box>
        </Box>
    );
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
    onOpenProfile,
    profile,
}) => {
    const [selectedPhoto, setSelectedPhoto] =
        useState<SocialViewerPhoto | null>(null);
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
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: homeBackground,
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
                        sx={{
                            alignItems: "center",
                            color: textBase,
                            display: "flex",
                            height: 24,
                            justifyContent: "flex-start",
                            width: 24,
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
                            overflow: "visible",
                            width: 58,
                            "& svg": { display: "block", overflow: "visible" },
                        }}
                    >
                        <EnteLogo height={18} />
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label="Open profile"
                        onClick={onOpenProfile}
                        sx={{
                            alignItems: "center",
                            bgcolor: profile.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: 0,
                            borderRadius: "50%",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            height: 24,
                            justifyContent: "center",
                            justifySelf: "flex-end",
                            overflow: "hidden",
                            p: 0,
                            width: 24,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
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
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "36px",
                        mt: "22px",
                        pb: "16px",
                        width: "100%",
                    }}
                >
                    {sampleFeedItems.map((item) => (
                        <FeedItem
                            key={`${item.name}-${item.imageUrl}`}
                            aspectRatio={item.aspectRatio}
                            avatarUrl={item.avatarUrl}
                            imageUrl={item.imageUrl}
                            name={item.name}
                            onOpenPhoto={setSelectedPhoto}
                            timestampMs={item.timestampMs}
                        />
                    ))}
                </Box>
                {selectedPhoto && (
                    <SocialFileViewer
                        photo={selectedPhoto}
                        onClose={() => setSelectedPhoto(null)}
                    />
                )}
            </Box>
        </Box>
    );
};
