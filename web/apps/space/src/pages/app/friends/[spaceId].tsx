import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect, useMemo, useState } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { ProfileScreen } from "screens/ProfileScreen";
import {
    loadCurrentSpaceFriends,
    loadCurrentSpacePostAssetURL,
    loadCurrentSpaceProfile,
    loadCurrentSpaceProfilePostsPage,
    replyToCurrentPost,
    setCurrentPostLiked,
    type SpaceProfilePost,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { profilePostGroupsFromPosts } from "utils/spacePostDisplay";
import { friendSpaceIdFromQuery, spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

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
    const router = useSpaceRouter();
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
    const [isPostsLoading, setIsPostsLoading] = useState(false);
    const [loadedProfileSpaceId, setLoadedProfileSpaceId] = useState<string>();
    const [loadedPostsSpaceId, setLoadedPostsSpaceId] = useState<string>();
    const [selectedProfile, setSelectedProfile] = useState(selectedFriend);
    const [posts, setPosts] = useState<SpaceProfilePost[]>([]);
    const selectedFriendSpaceId = selectedFriend?.spaceId;
    const hasLoadedPostsForSelectedFriend =
        loadedPostsSpaceId == selectedFriendSpaceId;
    const postGroups = useMemo(
        () =>
            hasLoadedPostsForSelectedFriend
                ? profilePostGroupsFromPosts(posts)
                : [],
        [hasLoadedPostsForSelectedFriend, posts],
    );
    const showProfileLoading = Boolean(
        selectedFriendSpaceId &&
            (isProfileLoading || loadedProfileSpaceId != selectedFriendSpaceId),
    );
    const showPostsLoading = Boolean(
        selectedFriendSpaceId &&
            (isPostsLoading || !hasLoadedPostsForSelectedFriend),
    );
    const currentSelectedProfile =
        selectedProfile?.spaceId == selectedFriendSpaceId
            ? selectedProfile
            : undefined;

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
        if (!selectedFriendSpaceId) {
            setIsProfileLoading(false);
            setIsPostsLoading(false);
            setLoadedProfileSpaceId(undefined);
            setLoadedPostsSpaceId(undefined);
            setSelectedProfile(undefined);
            setPosts([]);
            return;
        }

        let cancelled = false;
        setSelectedProfile(undefined);
        setPosts([]);
        setIsProfileLoading(true);
        setIsPostsLoading(true);
        void loadCurrentSpaceProfile(selectedFriendSpaceId)
            .then((nextProfile) => {
                if (cancelled) return;
                setSelectedProfile(nextProfile);
            })
            .catch((error: unknown) =>
                console.error("Failed to load friend profile", error),
            )
            .finally(() => {
                if (!cancelled) {
                    setLoadedProfileSpaceId(selectedFriendSpaceId);
                    setIsProfileLoading(false);
                }
            });
        void loadCurrentSpaceProfilePostsPage(selectedFriendSpaceId)
            .then((page) => {
                if (!cancelled) setPosts(page.items);
            })
            .catch((error: unknown) =>
                console.error("Failed to load friend posts", error),
            )
            .finally(() => {
                if (!cancelled) {
                    setLoadedPostsSpaceId(selectedFriendSpaceId);
                    setIsPostsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedFriendSpaceId]);

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
                    currentSelectedProfile?.friendsCount ??
                    selectedFriend.friendsCount
                }
                headerVariant="friend"
                isCoverLoading={showProfileLoading}
                isPostsLoading={showPostsLoading}
                isStatsLoading={showProfileLoading || showPostsLoading}
                postGroups={postGroups}
                profile={{
                    avatarUrl:
                        currentSelectedProfile?.avatarUrl ??
                        selectedFriend.avatarUrl ??
                        null,
                    coverUrl: currentSelectedProfile?.coverUrl ?? null,
                    coverObjectKey: currentSelectedProfile?.coverObjectKey,
                    coverUpdatedAt: currentSelectedProfile?.coverUpdatedAt,
                    fullName:
                        currentSelectedProfile?.fullName ??
                        selectedFriend.fullName,
                    username:
                        currentSelectedProfile?.username ??
                        selectedFriend.username,
                    spaceId:
                        currentSelectedProfile?.spaceId ??
                        selectedFriend.spaceId,
                    spaceSlug:
                        currentSelectedProfile?.spaceSlug ??
                        selectedFriend.spaceSlug,
                }}
                onBack={goBack}
                onLoadPostImage={loadCurrentSpacePostAssetURL}
                onReplyToPost={replyToCurrentPost}
                onSetPostLiked={setCurrentPostLiked}
                showPostLoadingIndicator={false}
            />
        </>
    );
};

export default Page;
