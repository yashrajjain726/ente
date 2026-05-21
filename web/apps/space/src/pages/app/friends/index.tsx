import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { FriendsScreen, friendsBackground } from "screens/FriendsScreen";
import {
    loadCurrentSpaceFriends,
    removeCurrentSpaceFriend,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        refreshProfile,
        setFriends,
    } = useSpaceAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!profile?.spaceId) return;

        void loadCurrentSpaceFriends(profile.spaceId)
            .then(setFriends)
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            );
    }, [profile?.spaceId, setFriends]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                actionLabel={profileLoadStatus == "error" ? "Retry" : undefined}
                background={friendsBackground}
                message={profileLoadError}
                onAction={() => void refreshProfile()}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={friendsBackground} />
            <FriendsScreen
                friends={friends}
                onBack={() => void router.push(spaceRoutes.profile)}
                onOpenFriend={(friendID) =>
                    void router.push(spaceRoutes.friend(friendID))
                }
                onUnfriend={async (friendID) => {
                    const friend = friends.find(
                        (candidate) => candidate.id == friendID,
                    );
                    if (!friend?.spaceId) return;

                    await removeCurrentSpaceFriend(friend.spaceId);
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
