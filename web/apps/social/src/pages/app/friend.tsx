import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { ProfileScreen } from "screens/ProfileScreen";
import {
    loadCurrentPostLikers,
    loadCurrentWallFriends,
    loadCurrentWallPostsPage,
    setCurrentPostLiked,
    type SocialWallPost,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import {
    friendIDFromQuery,
    friendProfileSourceFromQuery,
    socialRoutes,
} from "utils/socialRoutes";
import { profilePostGroupsFromPosts } from "utils/socialWallDisplay";

const backRouteForSource = (
    source: ReturnType<typeof friendProfileSourceFromQuery>,
) =>
    source == "home"
        ? socialRoutes.home
        : source == "profile"
          ? socialRoutes.profile
          : socialRoutes.friends;

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();
    const friendID = friendIDFromQuery(router.query.friendID);
    const backSource = friendProfileSourceFromQuery(router.query.from);
    const selectedFriend = friends.find((friend) => friend.id == friendID);
    const [friendsLoadAttempted, setFriendsLoadAttempted] = useState(false);
    const [posts, setPosts] = useState<SocialWallPost[]>([]);
    const postGroups = useMemo(
        () => profilePostGroupsFromPosts(posts),
        [posts],
    );

    useEffect(() => {
        if (!router.isReady) return;
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
            return;
        }
        if (
            profileLoadStatus == "ready" &&
            friendsLoadAttempted &&
            !selectedFriend
        ) {
            void router.replace(socialRoutes.friends);
        }
    }, [
        friendsLoadAttempted,
        profile,
        profileLoadStatus,
        router,
        selectedFriend,
    ]);

    useEffect(() => {
        if (!profile?.wallId) return;

        void loadCurrentWallFriends(profile.wallId)
            .then(setFriends)
            .catch((error: unknown) =>
                console.error("Failed to load social friends", error),
            )
            .finally(() => setFriendsLoadAttempted(true));
    }, [profile?.wallId, setFriends]);

    useEffect(() => {
        if (!selectedFriend?.wallId) return;

        void loadCurrentWallPostsPage(selectedFriend.wallId)
            .then((page) => setPosts(page.items))
            .catch((error: unknown) =>
                console.error("Failed to load friend posts", error),
            );
    }, [selectedFriend?.wallId]);

    if (
        !router.isReady ||
        profileLoadStatus == "loading" ||
        !profile ||
        !selectedFriend
    ) {
        return <SocialRouteFallback background={friendsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={friendsBackground} />
            <ProfileScreen
                friendsCount={selectedFriend.friendsCount}
                headerVariant="friend"
                postGroups={postGroups}
                profile={{
                    avatarUrl: selectedFriend.avatarUrl ?? null,
                    fullName: selectedFriend.fullName,
                    username: selectedFriend.username,
                    wallId: selectedFriend.wallId,
                    wallSlug: selectedFriend.wallSlug,
                }}
                onBack={() => void router.push(backRouteForSource(backSource))}
                onOpenFriend={(nextFriendID) =>
                    void router.push(
                        socialRoutes.friend(nextFriendID, backSource),
                    )
                }
                onLoadPostLikers={loadCurrentPostLikers}
                onSetPostLiked={setCurrentPostLiked}
            />
        </>
    );
};

export default Page;
