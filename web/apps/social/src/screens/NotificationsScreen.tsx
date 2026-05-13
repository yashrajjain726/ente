import {
    ArrowLeft02Icon,
    Comment01Icon,
    FavouriteIcon,
    MailReply01Icon,
    UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Box } from "@mui/material";
import type { FriendProfile } from "data/friends";
import React from "react";
import { formatSocialDate, initialsFor } from "utils/socialDisplay";

export const notificationsBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textSoft = "#777777";
const timelineLine = "#E6E6E6";

type NotificationType =
    | "liked-post"
    | "commented-post"
    | "liked-comment"
    | "replied-comment"
    | "added-friend";

interface SocialNotification {
    actor: Pick<FriendProfile, "avatarUrl" | "fullName" | "id" | "username">;
    id: string;
    postThumbnailUrl?: string;
    timestampMs: number;
    type: NotificationType;
}

interface NotificationsScreenProps {
    onBack?: () => void;
    onOpenFriend?: (friendID: string) => void;
}

interface NotificationRowProps {
    notification: SocialNotification;
    onOpenFriend?: (friendID: string) => void;
}

const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);

const sampleActors = {
    aparna: {
        avatarUrl: "/images/sample-feed-4.jpg",
        fullName: "Aparna Bhatnagar",
        id: "aparna-bhatnagar",
        username: "aparnab",
    },
    dev: {
        avatarUrl: "/images/sample-feed-1.jpg",
        fullName: "Dev Shah",
        id: "dev-shah",
        username: "devshah",
    },
    isha: {
        avatarUrl: "/images/sample-feed-2.jpg",
        fullName: "Isha Mehta",
        id: "isha-mehta",
        username: "ishamehta",
    },
    kabir: {
        avatarUrl: "/images/sample-avatar.jpg",
        fullName: "Kabir Menon",
        id: "kabir-menon",
        username: "kabirmenon",
    },
    mira: {
        avatarUrl: "/images/sample-feed-3.jpg",
        fullName: "Mira Sen",
        id: "mira-sen",
        username: "mirasen",
    },
    nikhil: {
        avatarUrl: "/images/sample-feed-5.jpg",
        fullName: "Nikhil Rao",
        id: "nikhil-rao",
        username: "nikhilrao",
    },
    riya: {
        avatarUrl: "/images/sample-feed-6.jpg",
        fullName: "Riya Kapoor",
        id: "riya-kapoor",
        username: "riyakapoor",
    },
} satisfies Record<string, SocialNotification["actor"]>;

const sampleNotifications: SocialNotification[] = [
    {
        actor: sampleActors.mira,
        id: "mira-liked-post",
        postThumbnailUrl: "/images/sample-feed-1.jpg",
        timestampMs: minutesAgo(12),
        type: "liked-post",
    },
    {
        actor: sampleActors.aparna,
        id: "aparna-commented-post",
        postThumbnailUrl: "/images/sample-feed-portrait-2.jpg",
        timestampMs: minutesAgo(38),
        type: "commented-post",
    },
    {
        actor: sampleActors.nikhil,
        id: "nikhil-liked-comment",
        postThumbnailUrl: "/images/sample-feed-3.jpg",
        timestampMs: hoursAgo(2),
        type: "liked-comment",
    },
    {
        actor: sampleActors.riya,
        id: "riya-replied-comment",
        postThumbnailUrl: "/images/sample-feed-portrait-4.jpg",
        timestampMs: hoursAgo(5),
        type: "replied-comment",
    },
    {
        actor: sampleActors.dev,
        id: "dev-added-friend",
        timestampMs: hoursAgo(8),
        type: "added-friend",
    },
    {
        actor: sampleActors.isha,
        id: "isha-commented-post",
        postThumbnailUrl: "/images/sample-feed-6.jpg",
        timestampMs: daysAgo(1),
        type: "commented-post",
    },
    {
        actor: sampleActors.kabir,
        id: "kabir-liked-post",
        postThumbnailUrl: "/images/sample-feed-portrait-1.jpg",
        timestampMs: daysAgo(2),
        type: "liked-post",
    },
    {
        actor: sampleActors.aparna,
        id: "aparna-replied-comment",
        postThumbnailUrl: "/images/sample-feed-5.jpg",
        timestampMs: daysAgo(4),
        type: "replied-comment",
    },
    {
        actor: sampleActors.mira,
        id: "mira-added-friend",
        timestampMs: daysAgo(8),
        type: "added-friend",
    },
];

const actionForNotification = (
    type: NotificationType,
): { icon: IconSvgElement; label: string } => {
    switch (type) {
        case "liked-post":
            return { icon: FavouriteIcon, label: "liked your post" };
        case "commented-post":
            return { icon: Comment01Icon, label: "commented on your post" };
        case "liked-comment":
            return { icon: FavouriteIcon, label: "liked a comment" };
        case "replied-comment":
            return { icon: MailReply01Icon, label: "replied to a comment" };
        case "added-friend":
            return { icon: UserAdd01Icon, label: "added you as a friend" };
    }
};

const NotificationRow: React.FC<NotificationRowProps> = ({
    notification,
    onOpenFriend,
}) => {
    const { icon, label } = actionForNotification(notification.type);
    const actorName =
        notification.actor.fullName.trim() || notification.actor.username;
    const actorInitials = initialsFor(actorName || notification.actor.username);

    return (
        <Box
            component="li"
            sx={{
                alignItems: "flex-start",
                display: "flex",
                gap: "12px",
                listStyle: "none",
                mb: "40px",
                position: "relative",
                width: "100%",
                "&:last-of-type": { mb: 0 },
                "&:not(:last-of-type)::before": {
                    backgroundImage: `repeating-linear-gradient(to bottom, ${timelineLine} 0px, ${timelineLine} 8px, transparent 8px, transparent 16px)`,
                    borderRadius: "1px",
                    bottom: "-40px",
                    content: '""',
                    left: "16px",
                    position: "absolute",
                    top: "33px",
                    width: "2px",
                },
            }}
        >
            <Box
                component="button"
                type="button"
                onClick={() => onOpenFriend?.(notification.actor.id)}
                sx={{
                    alignItems: "flex-start",
                    appearance: "none",
                    bgcolor: "transparent",
                    border: 0,
                    cursor: onOpenFriend ? "pointer" : "default",
                    display: "flex",
                    flex: 1,
                    gap: "12px",
                    minWidth: 0,
                    p: 0,
                    textAlign: "left",
                    width: "100%",
                    "&:focus-visible": {
                        borderRadius: "12px",
                        outline: `2px solid ${green}`,
                        outlineOffset: -4,
                    },
                }}
            >
                <Box
                    sx={{
                        alignItems: "center",
                        bgcolor: notificationsBackground,
                        borderRadius: "50%",
                        color: green,
                        display: "flex",
                        flexShrink: 0,
                        height: 33,
                        justifyContent: "center",
                        position: "relative",
                        zIndex: 1,
                        width: 33,
                    }}
                >
                    <HugeiconsIcon icon={icon} size={20} strokeWidth={1.8} />
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        flex: 1,
                        flexDirection: "column",
                        gap: "4px",
                        minWidth: 0,
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            display: "flex",
                            flexDirection: "row",
                        }}
                    >
                        <Box
                            sx={{
                                alignItems: "center",
                                bgcolor: notification.actor.avatarUrl
                                    ? "transparent"
                                    : paleGreen,
                                border: `2px solid ${notificationsBackground}`,
                                borderRadius: "50%",
                                color: green,
                                boxSizing: "border-box",
                                display: "flex",
                                flexShrink: 0,
                                height: 32,
                                justifyContent: "center",
                                overflow: "hidden",
                                width: 32,
                            }}
                        >
                            {notification.actor.avatarUrl ? (
                                <Box
                                    component="img"
                                    alt=""
                                    src={notification.actor.avatarUrl}
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
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        lineHeight: 1,
                                    }}
                                >
                                    {actorInitials}
                                </Box>
                            )}
                        </Box>
                    </Box>
                    <Box
                        sx={{
                            color: textBase,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: "19px",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {actorName}
                    </Box>
                    <Box
                        sx={{
                            color: textSoft,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: "18px",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {label}
                        <Box component="span" aria-hidden sx={{ px: "5px" }}>
                            ·
                        </Box>
                        <Box
                            component="time"
                            dateTime={new Date(
                                notification.timestampMs,
                            ).toISOString()}
                            sx={{ display: "inline" }}
                        >
                            {formatSocialDate(notification.timestampMs)}
                        </Box>
                    </Box>
                </Box>
                {notification.postThumbnailUrl && (
                    <Box
                        component="img"
                        alt=""
                        src={notification.postThumbnailUrl}
                        sx={{
                            borderRadius: "8px",
                            display: "block",
                            flexShrink: 0,
                            height: 76,
                            objectFit: "cover",
                            objectPosition: "center",
                            width: 76,
                        }}
                    />
                )}
            </Box>
        </Box>
    );
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
    onBack,
    onOpenFriend,
}) => (
    <Box
        component="main"
        sx={{
            bgcolor: notificationsBackground,
            boxSizing: "border-box",
            color: textBase,
            display: "grid",
            minHeight: "100svh",
            overflowX: "hidden",
            placeItems: { xs: "stretch", sm: "start center" },
        }}
    >
        <Box
            sx={{
                bgcolor: notificationsBackground,
                boxSizing: "border-box",
                minHeight: "100svh",
                mx: "auto",
                width: "100%",
                "@media (min-width: 600px)": { maxWidth: 390 },
            }}
        >
            <Box
                component="header"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    gridTemplateColumns: "24px 1fr 24px",
                    height: 56,
                    px: 2,
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
                        cursor: onBack ? "pointer" : "default",
                        display: "flex",
                        height: 24,
                        justifyContent: "flex-start",
                        ml: "-2px",
                        p: 0,
                        width: 24,
                        "&:focus-visible": {
                            borderRadius: "50%",
                            outline: `2px solid ${green}`,
                            outlineOffset: 2,
                        },
                    }}
                >
                    <HugeiconsIcon
                        icon={ArrowLeft02Icon}
                        size={24}
                        strokeWidth={1.8}
                    />
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
                    }}
                >
                    Notifications
                </Box>
            </Box>

            <Box
                component="ul"
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    m: 0,
                    mt: "40px",
                    px: "24px",
                    py: 0,
                    width: "100%",
                }}
            >
                {sampleNotifications.map((notification) => (
                    <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onOpenFriend={onOpenFriend}
                    />
                ))}
            </Box>
        </Box>
    </Box>
);
