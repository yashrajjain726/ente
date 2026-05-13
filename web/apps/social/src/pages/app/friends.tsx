import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { FriendsScreen, friendsBackground } from "screens/FriendsScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, setFriends } = useSocialAppState();

    useEffect(() => {
        if (!profile) void router.replace(socialRoutes.onboarding);
    }, [profile, router]);

    if (!profile) {
        return <SocialRouteFallback background={friendsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={friendsBackground} />
            <FriendsScreen
                friends={friends}
                onBack={() => void router.push(socialRoutes.profile)}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID, "friends"))
                }
                onUnfriend={(friendID) =>
                    setFriends((currentFriends) =>
                        currentFriends.filter(
                            (friend) => friend.id != friendID,
                        ),
                    )
                }
            />
        </>
    );
};

export default Page;
