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
import { friendWallIdFromQuery, socialRoutes } from "utils/socialRoutes";
import { profilePostGroupsFromPosts } from "utils/socialWallDisplay";

const friendWallIdFromPath = () => {
    if (typeof window == "undefined") return "";
    const match = /^\/app\/friends\/([^/?#]+)/.exec(window.location.pathname);
    if (!match?.[1]) return "";

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return "";
    }
};

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();
    const friendWallId =
        friendWallIdFromQuery(router.query.wallId) || friendWallIdFromPath();
    const selectedFriend = friends.find(
        (friend) => friend.wallId == friendWallId || friend.id == friendWallId,
    );
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

    const goBack = () => {
        if (typeof window != "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        void router.push(socialRoutes.friends);
    };

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
                onBack={goBack}
                onOpenFriend={(nextFriendID) =>
                    void router.push(socialRoutes.friend(nextFriendID))
                }
                onLoadPostLikers={loadCurrentPostLikers}
                onSetPostLiked={setCurrentPostLiked}
            />
        </>
    );
};

export default Page;
