import { ArrowLeft02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SocialFileViewer,
    type SocialLiker,
    type SocialViewerPhoto,
} from "components/SocialFileViewer";
import { SocialLoadingSpinner } from "components/SocialRouteFallback";
import type { FriendProfile } from "data/friends";
import { formatTimeAgo } from "ente-base/date";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import { firstNameFrom, initialsFor } from "utils/socialDisplay";

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

type NotificationType = "liked-post" | "added-friend";

interface SocialNotification {
    actor: Pick<FriendProfile, "avatarUrl" | "fullName" | "id" | "username">;
    id: string;
    post?: SocialViewerPhoto;
    postThumbnailUrl?: string;
    timestampMs: number;
    type: NotificationType;
}

interface NotificationsScreenProps {
    isNotificationsLoading?: boolean;
    onBack?: () => void;
    onOpenFriend?: (friendID: string) => void;
    profile: SetupProfile;
    notifications: SocialNotification[];
    onLoadPostLikers?: (postId: number) => Promise<SocialLiker[]>;
    onSetPostLiked?: (postId: number, liked: boolean) => Promise<void>;
}

interface NotificationRowProps {
    notification: SocialNotification;
    onOpenFriend?: (friendID: string) => void;
    onOpenPost?: (notification: SocialNotification) => void;
}

const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;

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

const UserAddNotificationIcon: React.FC = () => (
    <HugeiconsIcon icon={UserAdd01Icon} size={17} strokeWidth={1.8} />
);

const actionForNotification = (
    type: NotificationType,
): { icon: React.ReactNode; label: string } => {
    switch (type) {
        case "liked-post":
            return { icon: <LikedPhotoIcon />, label: "liked your post" };
        case "added-friend":
            return {
                icon: <UserAddNotificationIcon />,
                label: "added you as a friend",
            };
    }
};

const NotificationRow: React.FC<NotificationRowProps> = ({
    notification,
    onOpenFriend,
    onOpenPost,
}) => {
    const { icon, label } = actionForNotification(notification.type);
    const actorName =
        notification.actor.fullName.trim() || notification.actor.username;
    const actorFirstName = firstNameFrom(actorName);
    const actorInitials = initialsFor(
        actorFirstName || notification.actor.username,
    );
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
                sx={{
                    alignItems: "flex-start",
                    display: "flex",
                    flex: 1,
                    gap: "8px",
                    minWidth: 0,
                    width: "100%",
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
                            component="button"
                            type="button"
                            aria-label={`Open ${actorFirstName}'s profile`}
                            onClick={() =>
                                onOpenFriend?.(notification.actor.id)
                            }
                            sx={{
                                appearance: "none",
                                alignItems: "center",
                                bgcolor: notification.actor.avatarUrl
                                    ? "transparent"
                                    : paleGreen,
                                border: `2px solid ${notificationsBackground}`,
                                borderRadius: "50%",
                                color: green,
                                boxSizing: "border-box",
                                cursor: onOpenFriend ? "pointer" : "default",
                                display: "flex",
                                flexShrink: 0,
                                height: 32,
                                justifyContent: "center",
                                overflow: "hidden",
                                p: 0,
                                width: 32,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
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
                            fontWeight: 500,
                            lineHeight: "19px",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <Box
                            component="button"
                            type="button"
                            aria-label={`Open ${actorFirstName}'s profile`}
                            onClick={() =>
                                onOpenFriend?.(notification.actor.id)
                            }
                            sx={{
                                appearance: "none",
                                bgcolor: "transparent",
                                border: 0,
                                borderRadius: "4px",
                                color: "inherit",
                                cursor: onOpenFriend ? "pointer" : "default",
                                display: "inline",
                                font: "inherit",
                                fontWeight: 600,
                                lineHeight: "inherit",
                                p: 0,
                                textAlign: "left",
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            {actorFirstName}
                        </Box>{" "}
                        {label}
                    </Box>
                    <Box
                        component="time"
                        dateTime={timestampDateTime}
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
                        {timestampLabel}
                    </Box>
                </Box>
                {notification.postThumbnailUrl && (
                    <Box
                        component="button"
                        type="button"
                        aria-label="Open your post"
                        onClick={() => onOpenPost?.(notification)}
                        sx={{
                            appearance: "none",
                            bgcolor: "transparent",
                            border: 0,
                            borderRadius: "8px",
                            display: "block",
                            flexShrink: 0,
                            height: 74,
                            overflow: "hidden",
                            p: 0,
                            width: 74,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <Box
                            component="img"
                            alt=""
                            src={notification.postThumbnailUrl}
                            sx={{
                                display: "block",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: "center",
                                width: "100%",
                            }}
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
    isNotificationsLoading = false,
    notifications,
    onBack,
    onLoadPostLikers,
    onOpenFriend,
    onSetPostLiked,
    profile,
}) => {
    const [selectedPost, setSelectedPost] =
        React.useState<SocialViewerPhoto | null>(null);
    const profileName = profile.fullName.trim() || profile.username.trim();
    const hasNotifications = notifications.length > 0;
    const openPost = (notification: SocialNotification) => {
        if (!notification.postThumbnailUrl) return;

        setSelectedPost(
            notification.post ?? {
                alt: `${profileName} post`,
                avatarUrl: profile.avatarUrl,
                imageUrl: notification.postThumbnailUrl,
                name: profileName,
                timestampMs: notification.timestampMs,
            },
        );
    };

    return (
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
                    position: "relative",
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

                {hasNotifications ? (
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
                        {notifications.map((notification) => (
                            <NotificationRow
                                key={notification.id}
                                notification={notification}
                                onOpenFriend={onOpenFriend}
                                onOpenPost={openPost}
                            />
                        ))}
                    </Box>
                ) : isNotificationsLoading ? (
                    <Box
                        sx={{
                            alignItems: "center",
                            boxSizing: "border-box",
                            display: "flex",
                            inset: 0,
                            justifyContent: "center",
                            pointerEvents: "none",
                            position: "absolute",
                            px: 3,
                            textAlign: "center",
                        }}
                    >
                        <SocialLoadingSpinner ariaLabel="Loading notifications" />
                    </Box>
                ) : (
                    <Box
                        sx={{
                            alignItems: "center",
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            inset: 0,
                            justifyContent: "center",
                            pointerEvents: "none",
                            position: "absolute",
                            px: 3,
                            textAlign: "center",
                        }}
                    >
                        <Box
                            component="h2"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 700,
                                letterSpacing: 0,
                                lineHeight: "22px",
                                m: 0,
                            }}
                        >
                            No notifications yet
                        </Box>
                        <Box
                            component="p"
                            sx={{
                                color: textSoft,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 500,
                                lineHeight: "20px",
                                m: 0,
                                mt: "8px",
                                maxWidth: 240,
                            }}
                        >
                            Likes, replies and new friends will appear here.
                        </Box>
                    </Box>
                )}
            </Box>
            {selectedPost && (
                <SocialFileViewer
                    onClose={() => setSelectedPost(null)}
                    onLoadPostLikers={onLoadPostLikers}
                    photo={selectedPost}
                    postActionMode="like-with-count"
                    onSetPostLiked={onSetPostLiked}
                />
            )}
        </Box>
    );
};
