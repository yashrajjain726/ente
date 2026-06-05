import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import {
    NotificationsScreen,
    notificationsBackground,
} from "screens/NotificationsScreen";
import {
    createCurrentProfileLink,
    loadCurrentNotifications,
    markCurrentNotificationsRead,
    type SpaceNotification,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

export const SpaceNotificationsPage: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadError, profileLoadStatus } = useSpaceAppState();
    const [notifications, setNotifications] = React.useState<
        SpaceNotification[]
    >([]);
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
                isLoading={isLoading}
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
