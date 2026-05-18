import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
    NotificationsScreen,
    notificationsBackground,
} from "screens/NotificationsScreen";
import {
    loadCurrentNotificationsPage,
    loadCurrentPostLikers,
    setCurrentPostLiked,
    type SocialWallNotification,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";
import { notificationForScreen } from "utils/socialWallDisplay";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus } = useSocialAppState();
    const [notifications, setNotifications] = useState<
        SocialWallNotification[]
    >([]);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(true);
    const screenNotifications = useMemo(
        () => notifications.map(notificationForScreen),
        [notifications],
    );

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!profile) return;

        let cancelled = false;
        setIsNotificationsLoading(true);
        void loadCurrentNotificationsPage()
            .then((page) => {
                if (cancelled) return;
                setNotifications(page.items);
            })
            .catch((error: unknown) =>
                console.error("Failed to load notifications", error),
            )
            .finally(() => {
                if (!cancelled) setIsNotificationsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={notificationsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={notificationsBackground} />
            <NotificationsScreen
                isNotificationsLoading={isNotificationsLoading}
                notifications={screenNotifications}
                onBack={() => void router.push(socialRoutes.home)}
                onOpenFriend={(friendID) =>
                    void router.push(
                        socialRoutes.friend(friendID, "notifications"),
                    )
                }
                onOpenMessages={() => void router.push(socialRoutes.messages)}
                onLoadPostLikers={loadCurrentPostLikers}
                onSetPostLiked={setCurrentPostLiked}
                profile={profile}
            />
        </>
    );
};

export default Page;
