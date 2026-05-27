import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { ProfileScreen } from "screens/ProfileScreen";
import {
    loadCurrentSpaceFriends,
    loadCurrentSpacePostAssetURL,
    loadCurrentSpaceProfile,
    loadCurrentSpaceProfilePostsPage,
    setCurrentPostLiked,
    type SpaceProfilePost,
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
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState(selectedFriend);
    const [posts, setPosts] = useState<SpaceProfilePost[]>([]);
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
        if (!selectedFriend?.spaceId) {
            setIsProfileLoading(false);
            return;
        }

        let cancelled = false;
        setSelectedProfile(selectedFriend);
        setIsProfileLoading(true);
        void loadCurrentSpaceProfile(selectedFriend.spaceId)
            .then((nextProfile) => {
                if (cancelled) return;
                setSelectedProfile(nextProfile);
            })
            .catch((error: unknown) =>
                console.error("Failed to load friend profile", error),
            )
            .finally(() => {
                if (!cancelled) setIsProfileLoading(false);
            });
        void loadCurrentSpaceProfilePostsPage(selectedFriend.spaceId)
            .then((page) => {
                if (!cancelled) setPosts(page.items);
            })
            .catch((error: unknown) =>
                console.error("Failed to load friend posts", error),
            );

        return () => {
            cancelled = true;
        };
    }, [selectedFriend]);

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
                friendsCount={
                    selectedProfile?.friendsCount ?? selectedFriend.friendsCount
                }
                headerVariant="friend"
                isCoverLoading={isProfileLoading}
                postGroups={postGroups}
                profile={{
                    avatarUrl:
                        selectedProfile?.avatarUrl ??
                        selectedFriend.avatarUrl ??
                        null,
                    coverUrl: selectedProfile?.coverUrl ?? null,
                    coverObjectKey: selectedProfile?.coverObjectKey,
                    coverUpdatedAt: selectedProfile?.coverUpdatedAt,
                    fullName:
                        selectedProfile?.fullName ?? selectedFriend.fullName,
                    username:
                        selectedProfile?.username ?? selectedFriend.username,
                    spaceId: selectedProfile?.spaceId ?? selectedFriend.spaceId,
                    spaceSlug:
                        selectedProfile?.spaceSlug ?? selectedFriend.spaceSlug,
                }}
                onBack={goBack}
                onLoadPostImage={loadCurrentSpacePostAssetURL}
                onSetPostLiked={setCurrentPostLiked}
            />
        </>
    );
};

export default Page;
