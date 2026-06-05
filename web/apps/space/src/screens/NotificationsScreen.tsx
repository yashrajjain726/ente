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

const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;

interface NotificationsScreenProps {
    isLoading?: boolean;
    notifications: SpaceNotification[];
    onBack?: () => void;
    onOpenFriendMessages?: (spaceId: string) => void;
    onOpenPost?: (spaceId: string, postId: number) => void;
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

const actorSpaceId = (actor: SpaceNotification["actor"]) =>
    actor.spaceId ?? actor.id;

const ActorName: React.FC<{ actor: SpaceNotification["actor"] }> = ({
    actor,
}) => (
    <Box component="span" sx={{ fontWeight: 700 }}>
        {fullName(actor)}
    </Box>
);

const PostLikeText: React.FC<{ actors: SpaceNotification["actor"][] }> = ({
    actors,
}) => {
    if (actors.length == 1) {
        return (
            <>
                <ActorName actor={actors[0]!} /> liked your post.
            </>
        );
    }
    if (actors.length == 2) {
        return (
            <>
                <ActorName actor={actors[0]!} /> and{" "}
                <ActorName actor={actors[1]!} /> liked your post.
            </>
        );
    }
    return (
        <>
            <ActorName actor={actors[0]!} /> and{" "}
            <Box component="span" sx={{ fontWeight: 700 }}>
                {actors.length - 1} others
            </Box>{" "}
            liked your post.
        </>
    );
};

const NotificationText: React.FC<{ group: NotificationGroup }> = ({
    group,
}) => {
    const actor = group.actors[0]!;
    switch (group.type) {
        case "friend_add":
            return (
                <>
                    <ActorName actor={actor} /> is now a friend.
                </>
            );
        case "friend_remove":
            return (
                <>
                    <ActorName actor={actor} /> is no longer friends with you.
                </>
            );
        case "post_like":
            return <PostLikeText actors={group.actors} />;
    }
};

const AvatarStack: React.FC<{ actors: SpaceNotification["actor"][] }> = ({
    actors,
}) => {
    const isPair = actors.length == 2;
    const displayedActors = isPair
        ? [actors[1]!, actors[0]!]
        : actors.slice(0, 3);
    const stackSize = isPair ? 48 : 44;

    return (
        <Box
            sx={{
                flexShrink: 0,
                height: stackSize,
                position: "relative",
                width: stackSize,
            }}
        >
            {displayedActors.map((actor, index) => {
                const isSingle = actors.length == 1;
                const avatarSize = isSingle ? 44 : isPair ? 34 : 30;
                const offset = isPair ? (index == 0 ? 0 : 12) : index * 6;
                const top = isPair ? (index == 0 ? 0 : 12) : index * 5;
                const zIndex = isPair ? index + 1 : 3 - index;

                return (
                    <Box
                        key={`${actor.spaceId ?? actor.id}-${index}`}
                        sx={{
                            bgcolor: avatarSkeletonBackground,
                            border: `2px solid ${notificationsBackground}`,
                            borderRadius: "50%",
                            height: avatarSize,
                            left: isSingle ? 0 : offset,
                            overflow: "hidden",
                            position: "absolute",
                            top: isSingle ? 0 : top,
                            width: avatarSize,
                            zIndex,
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
                                    objectPosition: "center",
                                    width: "100%",
                                }}
                            />
                        )}
                    </Box>
                );
            })}
        </Box>
    );
};

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
                : item.id;
        const existing = groups.get(key);
        if (existing) {
            if (item.createdAtMs > existing.createdAtMs) {
                existing.actors.unshift(item.actor);
            } else {
                existing.actors.push(item.actor);
            }
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

const NotificationRow: React.FC<{
    group: NotificationGroup;
    onOpenFriendMessages?: (spaceId: string) => void;
    onOpenPost?: (spaceId: string, postId: number) => void;
}> = ({ group, onOpenFriendMessages, onOpenPost }) => {
    const postImageUrl = group.post?.imageUrl;
    const avatarActors =
        group.type == "post_like" && group.actors.length > 2
            ? group.actors.slice(0, 1)
            : group.actors;
    const avatarColumnWidth = avatarActors.length == 2 ? 52 : 44;
    const friendActivityActor =
        group.type == "post_like" ? undefined : group.actors[0];
    const friendActivitySpaceId = friendActivityActor
        ? actorSpaceId(friendActivityActor)
        : undefined;
    const canOpenFriendMessages = Boolean(
        friendActivitySpaceId && onOpenFriendMessages,
    );
    const canOpenPost = Boolean(
        group.type == "post_like" &&
            group.post &&
            !group.post.isDeleted &&
            onOpenPost,
    );
    const canOpen = canOpenFriendMessages || canOpenPost;

    const openFriendMessages = () => {
        if (!friendActivitySpaceId) return;
        onOpenFriendMessages?.(friendActivitySpaceId);
    };

    const openRow = () => {
        if (canOpenPost && group.post) {
            onOpenPost?.(group.post.spaceId, group.post.postId);
            return;
        }
        if (canOpenFriendMessages) openFriendMessages();
    };

    return (
        <Box component="li">
            <Box
                component={canOpen ? "button" : "div"}
                type={canOpen ? "button" : undefined}
                onClick={canOpen ? openRow : undefined}
                sx={{
                    alignItems: "center",
                    appearance: "none",
                    bgcolor: "transparent",
                    border: 0,
                    borderRadius: "8px",
                    color: textBase,
                    cursor: canOpen ? "pointer" : "default",
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: postImageUrl
                        ? `${avatarColumnWidth}px minmax(0, 1fr) 44px`
                        : `${avatarColumnWidth}px minmax(0, 1fr)`,
                    minHeight: 64,
                    p: "8px 0",
                    textAlign: "left",
                    width: "100%",
                    "&:focus-visible": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 2,
                    },
                    "&:hover": { bgcolor: rowHover },
                }}
            >
                <AvatarStack actors={avatarActors} />
                <Box sx={{ minWidth: 0 }}>
                    <Box
                        component="p"
                        sx={{
                            color: textBase,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: "20px",
                            m: 0,
                        }}
                    >
                        <NotificationText group={group} />
                    </Box>
                    <Box
                        component="p"
                        sx={{
                            color: textSecondary,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: "18px",
                            m: 0,
                        }}
                    >
                        {formatTimeAgo(microsForTimestamp(group.createdAtMs))}
                    </Box>
                </Box>
                {postImageUrl && (
                    <Box
                        component="img"
                        alt=""
                        src={postImageUrl}
                        sx={{
                            borderRadius: "6px",
                            display: "block",
                            height: 44,
                            objectFit: "cover",
                            objectPosition: "center",
                            width: 44,
                        }}
                    />
                )}
            </Box>
        </Box>
    );
};

const NotificationSection: React.FC<{
    onOpenFriendMessages?: (spaceId: string) => void;
    onOpenPost?: (spaceId: string, postId: number) => void;
    section: NotificationSection;
}> = ({ onOpenFriendMessages, onOpenPost, section }) => {
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
                    <NotificationRow
                        key={group.id}
                        group={group}
                        onOpenFriendMessages={onOpenFriendMessages}
                        onOpenPost={onOpenPost}
                    />
                ))}
            </Box>
        </Box>
    );
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
    isLoading = false,
    notifications,
    onBack,
    onOpenFriendMessages,
    onOpenPost,
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
                        gridTemplateColumns: `${spaceTouchTargetSize}px 1fr ${spaceTouchTargetSize}px`,
                        height: 56,
                        px: 2,
                        position: "sticky",
                        top: 0,
                        width: "100%",
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
                            justifyContent: "flex-start",
                            ml: "-2px",
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
                                onOpenFriendMessages={onOpenFriendMessages}
                                onOpenPost={onOpenPost}
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
