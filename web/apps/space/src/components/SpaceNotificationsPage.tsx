import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React from "react";
import {
    NotificationsScreen,
    notificationsBackground,
} from "screens/NotificationsScreen";
import {
    createCurrentProfileLink,
    loadCurrentNotifications,
    loadCurrentSpaceFriends,
    markCurrentNotificationsRead,
    type SpaceNotification,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

export const SpaceNotificationsPage: React.FC = () => {
    const router = useSpaceRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
    } = useSpaceAppState();
    const [notifications, setNotifications] = React.useState<
        SpaceNotification[]
    >([]);
    const [isFriendsLoading, setIsFriendsLoading] = React.useState(true);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    React.useEffect(() => {
        if (!profile) return;

        let cancelled = false;
        setIsLoading(true);
        void loadCurrentNotifications()
            .then((page) => {
                if (cancelled) return;
                setNotifications(page.items);
                const latestUnread = page.items.find(
                    (notification) => notification.unread,
                );
                if (latestUnread) {
                    void markCurrentNotificationsRead(
                        latestUnread.createdAt,
                    ).catch((error: unknown) =>
                        console.warn(
                            "Failed to mark space notifications read",
                            error,
                        ),
                    );
                }
            })
            .catch((error: unknown) =>
                console.error("Failed to load space notifications", error),
            )
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile]);

    React.useEffect(() => {
        if (!profile?.spaceId) {
            setIsFriendsLoading(false);
            return;
        }

        let cancelled = false;
        setIsFriendsLoading(true);
        void loadCurrentSpaceFriends(profile.spaceId)
            .then((nextFriends) => {
                if (!cancelled) setFriends(nextFriends);
            })
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            )
            .finally(() => {
                if (!cancelled) setIsFriendsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.spaceId, setFriends]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={notificationsBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta
                themeColor={notificationsBackground}
                title="Notifications | Ente Space"
            />
            <NotificationsScreen
                friendsCount={friends.length}
                isLoading={isLoading || isFriendsLoading}
                notifications={notifications}
                onBack={() => void router.push(spaceRoutes.home)}
                onOpenFriendMessages={(spaceId) =>
                    void router.push(
                        spaceRoutes.messageFromNotifications(spaceId),
                    )
                }
                onOpenPost={(spaceId, postId) =>
                    void router.push(
                        spaceRoutes.postFromNotifications(spaceId, postId),
                    )
                }
                onShareProfileLink={async () => {
                    if (!profile.spaceId) throw new Error("Missing space.");
                    return (await createCurrentProfileLink(profile.spaceId))
                        .url;
                }}
            />
        </>
    );
};
