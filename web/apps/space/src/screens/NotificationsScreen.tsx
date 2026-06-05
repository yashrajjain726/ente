import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceInviteFriendsDialog } from "components/SpaceInviteFriendsDialog";
import { SpaceLoadingSpinner } from "components/SpaceRouteFallback";
import { formatTimeAgo } from "ente-base/date";
import React from "react";
import { ShareIcon } from "screens/ShareProfileLinkScreen";
import type { SpaceNotification } from "services/space";
import { spaceTouchTargetSize } from "styles/touchTargets";

export const notificationsBackground = "#FFFFFF";

const green = "#08C225";
const avatarSkeletonBackground = "#E6E6E6";
const textBase = "#000000";
const textSecondary = "#777777";
const rowHover = "#F6F6F6";
const dayMs = 24 * 60 * 60 * 1000;

interface NotificationsScreenProps {
    isLoading?: boolean;
    notifications: SpaceNotification[];
    onBack?: () => void;
    onShareProfileLink?: () => Promise<string>;
}

interface NotificationSection {
    items: SpaceNotification[];
    title: string;
}

interface NotificationGroup {
    actors: SpaceNotification["actor"][];
    createdAtMs: number;
    id: string;
    post?: SpaceNotification["post"];
    type: SpaceNotification["type"];
}

const fullName = (actor: SpaceNotification["actor"]) =>
    actor.fullName.trim() || actor.username.trim() || "Someone";

const actorSummary = (actors: SpaceNotification["actor"][]) => {
    if (actors.length == 0) return "Someone";
    const first = fullName(actors[0]!);
    if (actors.length == 1) return first;
    const second = fullName(actors[1]!);
    if (actors.length == 2) return `${first} and ${second}`;
    return `${first} and ${actors.length - 1} others`;
};

const notificationText = (group: NotificationGroup) => {
    const actors = actorSummary(group.actors);
    switch (group.type) {
        case "friend_add":
            return `${actors} became friends with you`;
        case "friend_remove":
            return `${actors} removed you as a friend`;
        case "post_like":
            return `${actors} liked your post`;
    }
};

const AvatarStack: React.FC<{ actors: SpaceNotification["actor"][] }> = ({
    actors,
}) => (
    <Box sx={{ flexShrink: 0, height: 42, position: "relative", width: 42 }}>
        {actors.slice(0, 3).map((actor, index) => (
            <Box
                key={`${actor.spaceId ?? actor.id}-${index}`}
                sx={{
                    bgcolor: avatarSkeletonBackground,
                    border: `2px solid ${notificationsBackground}`,
                    borderRadius: "50%",
                    height: actors.length == 1 ? 42 : 30,
                    left: actors.length == 1 ? 0 : index * 6,
                    overflow: "hidden",
                    position: "absolute",
                    top: actors.length == 1 ? 0 : index * 5,
                    width: actors.length == 1 ? 42 : 30,
                    zIndex: 3 - index,
                }}
            >
                {actor.avatarUrl && (
                    <Box
                        component="img"
                        alt=""
                        src={actor.avatarUrl}
                        sx={{
                            display: "block",
                            height: "100%",
                            objectFit: "cover",
                            width: "100%",
                        }}
                    />
                )}
            </Box>
        ))}
    </Box>
);

const timeSections = (notifications: SpaceNotification[]) => {
    const now = Date.now();
    const today = new Date(now);
    const startOfTodayMs = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    ).getTime();
    const startOfYesterdayMs = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 1,
    ).getTime();
    const sections: NotificationSection[] = [
        { title: "New", items: [] },
        { title: "Today", items: [] },
        { title: "Yesterday", items: [] },
        { title: "Last 7 days", items: [] },
        { title: "Last 30 days", items: [] },
        { title: "Older", items: [] },
    ];

    for (const notification of notifications) {
        if (notification.unread) {
            sections[0]!.items.push(notification);
            continue;
        }
        if (notification.createdAtMs >= startOfTodayMs) {
            sections[1]!.items.push(notification);
            continue;
        }
        if (notification.createdAtMs >= startOfYesterdayMs) {
            sections[2]!.items.push(notification);
            continue;
        }

        const ageMs = Math.max(0, now - notification.createdAtMs);
        if (ageMs <= 7 * dayMs) {
            sections[3]!.items.push(notification);
            continue;
        }
        if (ageMs <= 30 * dayMs) {
            sections[4]!.items.push(notification);
            continue;
        }
        sections[5]!.items.push(notification);
    }
    return sections;
};

const groupSectionNotifications = (items: SpaceNotification[]) => {
    const groups = new Map<string, NotificationGroup>();
    for (const item of items) {
        const key =
            item.type == "post_like"
                ? `post_like:${item.post?.postId ?? item.id}`
                : item.type;
        const existing = groups.get(key);
        if (existing) {
            existing.actors.push(item.actor);
            existing.createdAtMs = Math.max(
                existing.createdAtMs,
                item.createdAtMs,
            );
            continue;
        }
        groups.set(key, {
            actors: [item.actor],
            createdAtMs: item.createdAtMs,
            id: key,
            post: item.post,
            type: item.type,
        });
    }
    return [...groups.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
};

const NotificationRow: React.FC<{ group: NotificationGroup }> = ({ group }) => (
    <Box
        component="li"
        sx={{
            alignItems: "center",
            borderRadius: "8px",
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "42px minmax(0, 1fr) auto",
            minHeight: 62,
            px: "6px",
            py: "7px",
            "&:hover": { bgcolor: rowHover },
        }}
    >
        <AvatarStack actors={group.actors} />
        <Box sx={{ minWidth: 0 }}>
            <Box
                component="p"
                sx={{
                    color: textBase,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 650,
                    lineHeight: "19px",
                    m: 0,
                }}
            >
                {notificationText(group)}
            </Box>
            <Box
                component="p"
                sx={{
                    color: textSecondary,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: "16px",
                    m: 0,
                    mt: "2px",
                }}
            >
                {formatTimeAgo(group.createdAtMs)}
            </Box>
        </Box>
        {group.post?.imageUrl && (
            <Box
                component="img"
                alt=""
                src={group.post.imageUrl}
                sx={{
                    borderRadius: "6px",
                    display: "block",
                    height: 44,
                    objectFit: "cover",
                    width: 44,
                }}
            />
        )}
    </Box>
);

const NotificationSection: React.FC<{ section: NotificationSection }> = ({
    section,
}) => {
    const groups = groupSectionNotifications(section.items);
    if (groups.length == 0) return null;

    return (
        <Box component="section" sx={{ mb: "10px" }}>
            <Box
                component="h2"
                sx={{
                    color: textSecondary,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: "18px",
                    m: 0,
                    pb: "4px",
                    pt: "12px",
                }}
            >
                {section.title}
            </Box>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                {groups.map((group) => (
                    <NotificationRow key={group.id} group={group} />
                ))}
            </Box>
        </Box>
    );
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
    isLoading = false,
    notifications,
    onBack,
    onShareProfileLink,
}) => {
    const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);
    const [isInviteSharing, setIsInviteSharing] = React.useState(false);
    const [inviteShareError, setInviteShareError] = React.useState<
        string | null
    >(null);
    const sections = React.useMemo(
        () => timeSections(notifications),
        [notifications],
    );
    const showInviteEmptyState = Boolean(onShareProfileLink);

    const openInviteDialog = () => {
        setInviteShareError(null);
        setIsInviteDialogOpen(true);
    };

    const closeInviteDialog = () => {
        if (isInviteSharing) return;
        setIsInviteDialogOpen(false);
    };

    const shareInviteLink = async () => {
        if (!onShareProfileLink || isInviteSharing) return;
        setIsInviteSharing(true);
        setInviteShareError(null);

        try {
            const profileLink = await onShareProfileLink();
            if (typeof navigator.share == "function") {
                try {
                    await navigator.share({ url: profileLink });
                    setIsInviteDialogOpen(false);
                    return;
                } catch (error) {
                    if (
                        error instanceof DOMException &&
                        error.name == "AbortError"
                    )
                        return;
                }
            }

            await navigator.clipboard.writeText(profileLink);
            setIsInviteDialogOpen(false);
        } catch (error) {
            console.error("Failed to share space invite", error);
            setInviteShareError("Couldn't share invite. Please try again.");
        } finally {
            setIsInviteSharing(false);
        }
    };

    return (
        <Box
            sx={{
                bgcolor: notificationsBackground,
                color: textBase,
                minHeight: "100svh",
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
                        bgcolor: notificationsBackground,
                        boxSizing: "border-box",
                        display: "grid",
                        gridTemplateColumns: "44px minmax(0, 1fr) 44px",
                        height: 58,
                        px: "10px",
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back"
                        onClick={onBack}
                        sx={{
                            alignItems: "center",
                            appearance: "none",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: onBack ? "pointer" : "default",
                            display: "flex",
                            height: spaceTouchTargetSize,
                            justifyContent: "center",
                            p: 0,
                            width: spaceTouchTargetSize,
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
                            fontWeight: 750,
                            lineHeight: "24px",
                            m: 0,
                            textAlign: "center",
                        }}
                    >
                        Notifications
                    </Box>
                </Box>
                <Box sx={{ boxSizing: "border-box", px: "16px", pb: "28px" }}>
                    {isLoading ? (
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                height: "calc(100svh - 58px)",
                                justifyContent: "center",
                            }}
                        >
                            <SpaceLoadingSpinner ariaLabel="Loading notifications" />
                        </Box>
                    ) : notifications.length == 0 ? (
                        <Box
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                flexDirection: "column",
                                gap: "22px",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                height: "calc(100svh - 58px)",
                                justifyContent: "center",
                                px: 3,
                                textAlign: "center",
                            }}
                        >
                            <Box
                                component="p"
                                sx={{
                                    color: textSecondary,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    lineHeight: "20px",
                                    m: 0,
                                    maxWidth: 292,
                                }}
                            >
                                No notifications yet. Once you add friends,
                                you&apos;ll see post likes and friend updates
                                here.
                            </Box>
                            {showInviteEmptyState && (
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={openInviteDialog}
                                    sx={{
                                        alignItems: "center",
                                        bgcolor: "#F2F2F2",
                                        border: 0,
                                        borderRadius: "18px",
                                        color: textBase,
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        gap: "6px",
                                        height: spaceTouchTargetSize,
                                        justifyContent: "center",
                                        lineHeight: "18px",
                                        px: "14px",
                                        whiteSpace: "nowrap",
                                        "&:focus-visible": {
                                            outline: `2px solid ${green}`,
                                            outlineOffset: 2,
                                        },
                                        "&:hover": { bgcolor: "#E8E8E8" },
                                    }}
                                >
                                    <ShareIcon />
                                    Invite friends
                                </Box>
                            )}
                        </Box>
                    ) : (
                        sections.map((section) => (
                            <NotificationSection
                                key={section.title}
                                section={section}
                            />
                        ))
                    )}
                </Box>
            </Box>
            <SpaceInviteFriendsDialog
                errorMessage={inviteShareError}
                open={isInviteDialogOpen}
                sharing={isInviteSharing}
                onClose={closeInviteDialog}
                onShare={() => void shareInviteLink()}
            />
        </Box>
    );
};
