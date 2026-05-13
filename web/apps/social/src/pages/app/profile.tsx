import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { ProfileScreen, profileBackground } from "screens/ProfileScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile } = useSocialAppState();

    useEffect(() => {
        if (!profile) void router.replace(socialRoutes.onboarding);
    }, [profile, router]);

    if (!profile) {
        return <SocialRouteFallback background={profileBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={profileBackground} />
            <ProfileScreen
                friendsCount={friends.length}
                profile={profile}
                onBack={() => void router.push(socialRoutes.home)}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID, "profile"))
                }
                onOpenFriends={() => void router.push(socialRoutes.friends)}
                onOpenSettings={() => void router.push(socialRoutes.settings)}
            />
        </>
    );
};

export default Page;
