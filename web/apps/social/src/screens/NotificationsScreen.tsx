import {
    ArrowLeft02Icon,
    UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import type { FriendProfile } from "data/friends";
import { formatTimeAgo } from "ente-base/date";
import React from "react";
import { initialsFor } from "utils/socialDisplay";

export const notificationsBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textSoft = "#777777";
const timelineLine = "#E6E6E6";
const iconCircleBackground = "#F5F5F7";
const iconCircleSize = 28;
const iconCircleTopOffset = 2;
const timelineLineLeft = iconCircleSize / 2 - 1;
const timelineLineTop = iconCircleTopOffset + iconCircleSize;
const timelineListInset = "12px";
const thumbnailRightInset = "16px";

type NotificationType =
    | "liked-post"
    | "commented-post"
    | "liked-comment"
    | "liked-your-comment"
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
const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;

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
        actor: sampleActors.kabir,
        id: "kabir-liked-your-comment",
        postThumbnailUrl: "/images/sample-feed-portrait-1.jpg",
        timestampMs: hoursAgo(3),
        type: "liked-your-comment",
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

const LikedPhotoIcon: React.FC = () => (
    <svg
        width="15"
        height="13"
        viewBox="0 0 17 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6.99906 13.1537C4.84391 11.5421 0.574219 7.85775 0.574219 4.54219C0.574219 2.35074 2.1824 0.574219 4.39366 0.574219C5.5395 0.574219 6.68533 0.956163 8.21311 2.48394C9.74089 0.956163 10.8867 0.574219 12.0326 0.574219C14.2438 0.574219 15.852 2.35074 15.852 4.54219C15.852 7.85775 11.5823 11.5421 9.42716 13.1537C8.70192 13.696 7.7243 13.696 6.99906 13.1537Z"
            fill="#08C225"
            stroke="#08C225"
            strokeWidth="1.14583"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const CommentedPhotoIcon: React.FC = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M7.5 14.25C8.83502 14.25 10.1401 13.8541 11.2501 13.1124C12.3601 12.3707 13.2253 11.3165 13.7362 10.0831C14.2471 8.84971 14.3808 7.49252 14.1203 6.18314C13.8598 4.87377 13.217 3.67104 12.273 2.72703C11.329 1.78303 10.1262 1.14015 8.81686 0.879702C7.50749 0.619252 6.15029 0.752925 4.91689 1.26382C3.68349 1.77471 2.62928 2.63987 1.88758 3.7499C1.14588 4.85994 0.75 6.16498 0.75 7.5C0.75 8.616 1.02 9.66825 1.5 10.5953L0.75 14.25L4.40475 13.5C5.33175 13.98 6.38475 14.25 7.5 14.25Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const RepliedCommentIcon: React.FC = () => (
    <svg
        width="10"
        height="8"
        viewBox="0 0 12 9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M4.2334 0.0849609C4.39661 0.0849817 4.55308 0.151147 4.66797 0.268555C4.78252 0.386006 4.84664 0.544829 4.84668 0.709961C4.84668 0.875074 4.78246 1.03389 4.66797 1.15137L2.1748 3.70215H7.76855C8.41316 3.70215 9.34837 3.88326 10.1738 4.42969L10.3379 4.54297L10.5029 4.67188C11.3155 5.34145 11.918 6.39843 11.918 7.94531C11.9179 8.11049 11.8539 8.26927 11.7393 8.38672C11.6244 8.50422 11.4679 8.57119 11.3047 8.57129C11.1413 8.57129 10.985 8.5043 10.8701 8.38672C10.7553 8.26923 10.6905 8.11066 10.6904 7.94531C10.6904 6.70123 10.1974 5.98489 9.61914 5.55859C9.00926 5.10915 8.25891 4.95312 7.76855 4.95312H2.17578L4.66504 7.50098C4.72518 7.55831 4.77424 7.62756 4.80762 7.7041C4.84094 7.78063 4.85886 7.86362 4.86035 7.94727C4.8618 8.03105 4.84614 8.11459 4.81543 8.19238C4.78472 8.27017 4.73883 8.34087 4.68066 8.40039C4.62251 8.45986 4.55306 8.50745 4.47656 8.53906C4.40013 8.57058 4.31786 8.58645 4.23535 8.58496C4.1528 8.58343 4.07139 8.5646 3.99609 8.53027C3.9207 8.4959 3.85295 8.44634 3.79688 8.38477V8.38379L0.263672 4.76953C0.148973 4.65203 0.0849609 4.49242 0.0849609 4.32715C0.085085 4.16205 0.149084 4.00313 0.263672 3.88574L3.79883 0.268555C3.91373 0.151128 4.07015 0.0849609 4.2334 0.0849609Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.166667"
        />
    </svg>
);

const LikedCommentIcon: React.FC = () => (
    <svg
        width="18"
        height="17"
        viewBox="0 0 22 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M9.16797 16.043C10.5277 16.043 11.8569 15.6398 12.9875 14.8843C14.1181 14.1289 14.9993 13.0552 15.5196 11.7989C16.04 10.5427 16.1761 9.16035 15.9109 7.82673C15.6456 6.49311 14.9908 5.2681 14.0293 4.30661C13.0678 3.34513 11.8428 2.69035 10.5092 2.42507C9.17559 2.1598 7.79326 2.29595 6.53702 2.8163C5.28078 3.33665 4.20705 4.21784 3.45162 5.34843C2.69618 6.47901 2.29297 7.80823 2.29297 9.16797C2.29297 10.3046 2.56797 11.3764 3.05686 12.3205L2.29297 16.043L6.0154 15.2791C6.95957 15.768 8.03207 16.043 9.16797 16.043Z"
            stroke="currentColor"
            strokeWidth="1.52778"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M17.3555 10.0986C18.9264 10.0987 20.0537 11.3666 20.0537 12.8887C20.0536 14.0427 19.3203 15.2043 18.4863 16.1631C17.6399 17.1362 16.6287 17.9692 15.9541 18.4736C15.3852 18.899 14.6148 18.899 14.0459 18.4736C13.3713 17.9692 12.3601 17.1362 11.5137 16.1631C10.6797 15.2043 9.94638 14.0427 9.94629 12.8887C9.94629 11.3666 11.0736 10.0986 12.6445 10.0986C13.3933 10.0986 14.1193 10.34 15 11.1455C15.8807 10.34 16.6067 10.0986 17.3555 10.0986Z"
            stroke="white"
            strokeWidth="0.685221"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14.2513 18.1992C12.9222 17.2053 10.2891 14.9332 10.2891 12.8885C10.2891 11.537 11.2808 10.4414 12.6445 10.4414C13.3511 10.4414 14.0578 10.677 15 11.6191C15.9421 10.677 16.6488 10.4414 17.3554 10.4414C18.7191 10.4414 19.7109 11.537 19.7109 12.8885C19.7109 14.9332 17.0777 17.2053 15.7487 18.1992C15.3014 18.5336 14.6985 18.5336 14.2513 18.1992Z"
            fill="#08C225"
            stroke="#08C225"
            strokeWidth="0.685221"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const UserAddNotificationIcon: React.FC = () => (
    <HugeiconsIcon icon={UserAdd01Icon} size={17} strokeWidth={1.8} />
);

const actionForNotification = (
    type: NotificationType,
): { icon: React.ReactNode; label: string } => {
    switch (type) {
        case "liked-post":
            return { icon: <LikedPhotoIcon />, label: "Liked your post" };
        case "commented-post":
            return {
                icon: <CommentedPhotoIcon />,
                label: "Commented on your post",
            };
        case "liked-comment":
            return {
                icon: <LikedCommentIcon />,
                label: "Liked a comment",
            };
        case "liked-your-comment":
            return {
                icon: <LikedCommentIcon />,
                label: "Liked your comment",
            };
        case "replied-comment":
            return {
                icon: <RepliedCommentIcon />,
                label: "Replied to a comment",
            };
        case "added-friend":
            return {
                icon: <UserAddNotificationIcon />,
                label: "Added you as a friend",
            };
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
    const timestampMicros = microsForTimestamp(notification.timestampMs);
    const timestampDateTime = new Date(
        Math.floor(timestampMicros / 1000),
    ).toISOString();
    const timestampLabel = formatTimeAgo(timestampMicros);

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
                    left: `${timelineLineLeft}px`,
                    position: "absolute",
                    top: `${timelineLineTop}px`,
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
                    gap: "8px",
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
                        bgcolor: iconCircleBackground,
                        borderRadius: "50%",
                        color: green,
                        display: "flex",
                        flexShrink: 0,
                        height: iconCircleSize,
                        justifyContent: "center",
                        mt: `${iconCircleTopOffset}px`,
                        position: "relative",
                        zIndex: 1,
                        width: iconCircleSize,
                    }}
                >
                    {icon}
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
                        <Box
                            component="span"
                            aria-hidden
                            sx={{
                                color: textSoft,
                                px: "5px",
                            }}
                        >
                            ·
                        </Box>
                        <Box
                            component="time"
                            dateTime={timestampDateTime}
                            sx={{
                                color: textSoft,
                                display: "inline",
                            }}
                        >
                            {timestampLabel}
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
                            height: 74,
                            objectFit: "cover",
                            objectPosition: "center",
                            width: 74,
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
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    m: 0,
                    mt: "21px",
                    pb: "28px",
                    pl: timelineListInset,
                    pr: thumbnailRightInset,
                    pt: 0,
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
