import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus } = useSocialAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={homeBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={homeBackground} />
            <HomeScreen
                friendsCount={friends.length}
                profile={profile}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID, "home"))
                }
                onOpenNotifications={() =>
                    void router.push(socialRoutes.notifications)
                }
                onOpenProfile={() => void router.push(socialRoutes.profile)}
            />
        </>
    );
};

export default Page;
