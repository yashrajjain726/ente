import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textSecondary = "#6B6B6B";

const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);

const sampleFeedItems = [
    {
        avatarUrl: "/images/sample-feed-4.jpg",
        imageUrl: "/images/sample-feed-1.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: minutesAgo(22),
    },
    {
        avatarUrl: "/images/sample-feed-3.jpg",
        imageUrl: "/images/sample-feed-2.jpg",
        name: "Mira Sen",
        timestampMs: hoursAgo(3),
    },
    {
        avatarUrl: "/images/sample-feed-5.jpg",
        imageUrl: "/images/sample-feed-3.jpg",
        name: "Nikhil Rao",
        timestampMs: daysAgo(1),
    },
    {
        avatarUrl: "/images/sample-feed-6.jpg",
        imageUrl: "/images/sample-feed-4.jpg",
        name: "Riya Kapoor",
        timestampMs: daysAgo(2),
    },
    {
        avatarUrl: "/images/sample-feed-4.jpg",
        imageUrl: "/images/sample-feed-5.jpg",
        name: "Aparna Bhatnagar",
        timestampMs: daysAgo(4),
    },
    {
        avatarUrl: "/images/sample-feed-3.jpg",
        imageUrl: "/images/sample-feed-6.jpg",
        name: "Mira Sen",
        timestampMs: daysAgo(8),
    },
    {
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
    avatarUrl: string;
    imageUrl: string;
    name: string;
    timestampMs: number;
}

const firstNameFrom = (name: string) => name.trim().split(/\s+/)[0] || name;

const formatFeedDate = (timestampMs: number): string => {
    const now = Date.now();
    const diff = now - timestampMs;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const date = new Date(timestampMs);
    const locale =
        typeof navigator == "undefined" ? "en-US" : navigator.language;
    if (date.getFullYear() == new Date(now).getFullYear()) {
        return date.toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
        });
    }
    return date.toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

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
    avatarUrl,
    imageUrl,
    name,
    timestampMs,
}) => {
    const firstName = firstNameFrom(name);
    const dateLabel = formatFeedDate(timestampMs);

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
                sx={{
                    aspectRatio: "4 / 5",
                    bgcolor: paleGreen,
                    borderRadius: "20px",
                    display: "block",
                    mx: "16px",
                    overflow: "hidden",
                    width: "calc(100% - 32px)",
                }}
            >
                <Box
                    component="img"
                    alt={`${name} moment`}
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
                            avatarUrl={item.avatarUrl}
                            imageUrl={item.imageUrl}
                            name={item.name}
                            timestampMs={item.timestampMs}
                        />
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
