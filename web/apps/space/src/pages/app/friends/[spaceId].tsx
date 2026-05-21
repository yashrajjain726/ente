import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { ProfileScreen } from "screens/ProfileScreen";
import {
    loadCurrentPostLikers,
    loadCurrentSpaceFriends,
    loadCurrentSpacePostsPage,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { profilePostGroupsFromPosts } from "utils/spacePostDisplay";
import { friendSpaceIdFromQuery, spaceRoutes } from "utils/spaceRoutes";

const friendSpaceIdFromPath = () => {
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
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
    } = useSpaceAppState();
    const friendSpaceId =
        friendSpaceIdFromQuery(router.query.spaceId) || friendSpaceIdFromPath();
    const selectedFriend = friends.find(
        (friend) =>
            friend.spaceId == friendSpaceId || friend.id == friendSpaceId,
    );
    const [friendsLoadAttempted, setFriendsLoadAttempted] = useState(false);
    const [posts, setPosts] = useState<SpacePost[]>([]);
    const postGroups = useMemo(
        () => profilePostGroupsFromPosts(posts),
        [posts],
    );

    useEffect(() => {
        if (!router.isReady) return;
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
            return;
        }
        if (
            profileLoadStatus == "ready" &&
            friendsLoadAttempted &&
            !selectedFriend
        ) {
            void router.replace(spaceRoutes.friends);
        }
    }, [
        friendsLoadAttempted,
        profile,
        profileLoadStatus,
        router,
        selectedFriend,
    ]);

    useEffect(() => {
        if (!profile?.spaceId) return;

        void loadCurrentSpaceFriends(profile.spaceId)
            .then(setFriends)
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            )
            .finally(() => setFriendsLoadAttempted(true));
    }, [profile?.spaceId, setFriends]);

    useEffect(() => {
        if (!selectedFriend?.spaceId) return;

        void loadCurrentSpacePostsPage(selectedFriend.spaceId)
            .then((page) => setPosts(page.items))
            .catch((error: unknown) =>
                console.error("Failed to load friend posts", error),
            );
    }, [selectedFriend?.spaceId]);

    const goBack = () => {
        if (typeof window != "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        void router.push(spaceRoutes.friends);
    };

    if (
        !router.isReady ||
        profileLoadStatus != "ready" ||
        !profile ||
        !selectedFriend
    ) {
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
            <ProfileScreen
                friendsCount={selectedFriend.friendsCount}
                headerVariant="friend"
                postGroups={postGroups}
                profile={{
                    avatarUrl: selectedFriend.avatarUrl ?? null,
                    fullName: selectedFriend.fullName,
                    username: selectedFriend.username,
                    spaceId: selectedFriend.spaceId,
                    spaceSlug: selectedFriend.spaceSlug,
                }}
                onBack={goBack}
                onOpenFriend={(nextFriendID) =>
                    void router.push(spaceRoutes.friend(nextFriendID))
                }
                onLoadPostLikers={loadCurrentPostLikers}
                onSetPostLiked={setCurrentPostLiked}
            />
        </>
    );
};

export default Page;
