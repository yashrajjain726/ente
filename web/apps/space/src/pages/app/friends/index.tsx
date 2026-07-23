import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect } from "react";
import { FriendsScreen, friendsBackground } from "screens/FriendsScreen";
import {
    confirmCurrentFriendRequest,
    deleteCurrentFriendRequest,
    loadCurrentFriendAvatarURL,
    loadCurrentFriendRequests,
    loadCurrentSpaceFriends,
    removeCurrentSpaceFriend,
    type SpaceFriendRequest,
} from "services/space";
import { spaceInviteURL } from "services/spaceInvite";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
    } = useSpaceAppState();
    const [friendRequests, setFriendRequests] = React.useState<
        SpaceFriendRequest[]
    >([]);
    const [isFriendsLoading, setIsFriendsLoading] = React.useState(true);

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!profile?.spaceId) return;

        setIsFriendsLoading(true);
        void Promise.allSettled([
            loadCurrentFriendRequests(profile.spaceId),
            loadCurrentSpaceFriends(profile.spaceId),
        ])
            .then(([requestsResult, friendsResult]) => {
                if (requestsResult.status == "fulfilled") {
                    setFriendRequests(requestsResult.value);
                } else {
                    console.error(
                        "Failed to load space friend requests",
                        requestsResult.reason,
                    );
                }
                if (friendsResult.status == "fulfilled") {
                    setFriends(friendsResult.value);
                } else {
                    console.error(
                        "Failed to load space friends",
                        friendsResult.reason,
                    );
                }
            })
            .finally(() => setIsFriendsLoading(false));
    }, [profile?.spaceId, setFriends]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={friendsBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={friendsBackground} />
            <FriendsScreen
                friendRequests={friendRequests}
                friends={friends}
                isLoading={isFriendsLoading}
                onLoadFriendAvatar={loadCurrentFriendAvatarURL}
                onBack={() => void router.push(spaceRoutes.profile)}
                onMessage={(friendID) => {
                    const friend = friends.find(
                        (candidate) => candidate.id == friendID,
                    );
                    if (friend?.spaceId) {
                        void router.push(spaceRoutes.message(friend.spaceId));
                    }
                }}
                onOpenFriend={(friendID) =>
                    void router.push(spaceRoutes.friend(friendID))
                }
                profileLink={spaceInviteURL({
                    spaceUsername: profile.username,
                })}
                onAcceptFriendRequest={async (requestID) => {
                    const actorSpaceId = profile.spaceId;
                    if (!actorSpaceId) return;

                    await confirmCurrentFriendRequest(actorSpaceId, requestID);
                    setFriendRequests((currentRequests) =>
                        currentRequests.filter(
                            (request) => request.requestId != requestID,
                        ),
                    );
                    setFriends(await loadCurrentSpaceFriends(actorSpaceId));
                }}
                onDeleteFriendRequest={async (requestID) => {
                    const actorSpaceId = profile.spaceId;
                    if (!actorSpaceId) return;

                    await deleteCurrentFriendRequest(actorSpaceId, requestID);
                    setFriendRequests((currentRequests) =>
                        currentRequests.filter(
                            (request) => request.requestId != requestID,
                        ),
                    );
                }}
                onUnfriend={async (friendID) => {
                    const actorSpaceId = profile.spaceId;
                    if (!actorSpaceId) return;

                    const friend = friends.find(
                        (candidate) => candidate.id == friendID,
                    );
                    if (!friend?.spaceId) return;

                    await removeCurrentSpaceFriend(
                        actorSpaceId,
                        friend.spaceId,
                    );
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
