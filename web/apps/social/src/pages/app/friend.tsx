import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { sampleFriends } from "data/friends";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { ProfileScreen } from "screens/ProfileScreen";
import { useSocialAppState } from "state/socialAppState";
import {
    friendIDFromQuery,
    friendProfileSourceFromQuery,
    socialRoutes,
} from "utils/socialRoutes";

const backRouteForSource = (
    source: ReturnType<typeof friendProfileSourceFromQuery>,
) =>
    source == "home"
        ? socialRoutes.home
        : source == "notifications"
          ? socialRoutes.notifications
          : source == "profile"
            ? socialRoutes.profile
            : socialRoutes.friends;

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile } = useSocialAppState();
    const friendID = friendIDFromQuery(router.query.friendID);
    const backSource = friendProfileSourceFromQuery(router.query.from);
    const selectedFriend =
        friends.find((friend) => friend.id == friendID) ??
        sampleFriends.find((friend) => friend.id == friendID);

    useEffect(() => {
        if (!router.isReady) return;
        if (!profile) {
            void router.replace(socialRoutes.onboarding);
            return;
        }
        if (!selectedFriend) void router.replace(socialRoutes.friends);
    }, [profile, router, selectedFriend]);

    if (!router.isReady || !profile || !selectedFriend) {
        return <SocialRouteFallback background={friendsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={friendsBackground} />
            <ProfileScreen
                friendsCount={selectedFriend.friendsCount}
                headerVariant="friend"
                profile={{
                    avatarUrl: selectedFriend.avatarUrl,
                    fullName: selectedFriend.fullName,
                    username: selectedFriend.username,
                }}
                onBack={() => void router.push(backRouteForSource(backSource))}
                onOpenFriend={(nextFriendID) =>
                    void router.push(
                        socialRoutes.friend(nextFriendID, backSource),
                    )
                }
            />
        </>
    );
};

export default Page;
