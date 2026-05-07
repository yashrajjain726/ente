import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";

export const homeBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";

const sampleFeedItems = [
    {
        avatarUrl: "/images/sample-feed-4.jpg",
        name: "Aparna Bhatnagar",
        photos: [
            { imageUrl: "/images/sample-feed-1.jpg" },
            { imageUrl: "/images/sample-feed-5.jpg" },
            { imageUrl: "/images/sample-feed-2.jpg" },
        ],
    },
    {
        avatarUrl: "/images/sample-feed-3.jpg",
        name: "Mira Sen",
        photos: [
            { imageUrl: "/images/sample-feed-2.jpg" },
            { imageUrl: "/images/sample-feed-6.jpg" },
        ],
    },
    {
        avatarUrl: "/images/sample-feed-5.jpg",
        name: "Nikhil Rao",
        photos: [{ imageUrl: "/images/sample-feed-3.jpg" }],
    },
];

interface HomeScreenProps {
    onOpenProfile?: () => void;
    profile: SetupProfile;
}

interface FeedItemProps {
    avatarUrl: string;
    name: string;
    photos: { imageUrl: string }[];
}

const firstNameFrom = (name: string) => name.trim().split(/\s+/)[0] || name;

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

const FeedItem: React.FC<FeedItemProps> = ({ avatarUrl, name, photos }) => {
    const firstName = firstNameFrom(name);

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
                    px: "16px",
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
                        color: textBase,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 650,
                        lineHeight: "20px",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {firstName}
                </Box>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    gap: "16px",
                    overflowX: "auto",
                    overscrollBehaviorX: "contain",
                    px: "16px",
                    scrollPaddingInline: "16px",
                    scrollSnapType: "x mandatory",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                    width: "100%",
                    "&::-webkit-scrollbar": { display: "none" },
                }}
            >
                {photos.map((photo, index) => (
                    <Box
                        key={`${name}-${photo.imageUrl}-${index}`}
                        sx={{
                            aspectRatio: "4 / 5",
                            bgcolor: paleGreen,
                            borderRadius: "20px",
                            display: "block",
                            flex: "0 0 78%",
                            overflow: "hidden",
                            scrollSnapAlign: "start",
                            width: "78%",
                            "@media (min-width: 600px)": {
                                flexBasis: "76%",
                                width: "76%",
                            },
                        }}
                    >
                        <Box
                            component="img"
                            alt={`${name} photo ${index + 1}`}
                            src={photo.imageUrl}
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
                        pb: "28px",
                        width: "100%",
                    }}
                >
                    {sampleFeedItems.map((item) => (
                        <FeedItem
                            key={item.name}
                            avatarUrl={item.avatarUrl}
                            name={item.name}
                            photos={item.photos}
                        />
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
