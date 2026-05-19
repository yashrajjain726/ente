import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { FriendsScreen, friendsBackground } from "screens/FriendsScreen";
import {
    loadCurrentWallFriends,
    removeCurrentWallFriend,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!profile?.wallId) return;

        void loadCurrentWallFriends(profile.wallId)
            .then(setFriends)
            .catch((error: unknown) =>
                console.error("Failed to load social friends", error),
            );
    }, [profile?.wallId, setFriends]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={friendsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={friendsBackground} />
            <FriendsScreen
                friends={friends}
                onBack={() => void router.push(socialRoutes.profile)}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID))
                }
                onUnfriend={(friendID) => {
                    const friend = friends.find(
                        (candidate) => candidate.id == friendID,
                    );
                    if (friend?.wallId)
                        void removeCurrentWallFriend(friend.wallId);
                    setFriends((currentFriends) =>
                        currentFriends.filter(
                            (candidate) => candidate.id != friendID,
                        ),
                    );
                }}
            />
        </>
    );
};

export default Page;
