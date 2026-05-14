import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import {
    NotificationsScreen,
    notificationsBackground,
} from "screens/NotificationsScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus } = useSocialAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={notificationsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={notificationsBackground} />
            <NotificationsScreen
                onBack={() => void router.push(socialRoutes.home)}
                onOpenFriend={(friendID) =>
                    void router.push(
                        socialRoutes.friend(friendID, "notifications"),
                    )
                }
                profile={profile}
            />
        </>
    );
};

export default Page;
