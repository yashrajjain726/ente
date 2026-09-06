import { SpaceFriendLimitToast } from "components/FriendLimitToast";
import { SpaceFriendRequestCanceledToast } from "components/FriendRequestCanceledToast";
import { SpacePageMeta } from "components/PageMeta";
import { SpaceRouteFallback } from "components/RouteFallback";
import log from "ente-base/log";
import React, { useEffect, useState } from "react";
import { HomeScreen } from "screens/HomeScreen";
import {
    loadSpaceHomePosts,
    patchCachedSpaceHomePost,
    refreshSpaceHomePosts,
} from "services/home-posts";
import { consumeSentSpaceInviteFriend, spaceInviteURL } from "services/invite";
import { loadExistingSpaceId } from "services/profile";
import {
    clearSpaceFriendsCache,
    confirmCurrentFriendRequest,
    deleteCurrentFriendRequest,
    isFriendRequestCanceledError,
    isSpaceFriendLimitError,
    loadCurrentFriendAvatarURL,
    loadCurrentFriendRequests,
    loadCurrentSpaceFriends,
    loadCurrentSpacePostAssetURL,
    loadCurrentUnreadStatus,
    replyToCurrentPost,
    setCurrentPostLiked,
    type SpaceFriendRequest,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";
import { spaceAppBackgroundColor } from "styles/colors";
import { maximumSpaceFriendCount } from "utils/friend-limits";
import { useSpaceRouter } from "utils/route-transitions";
import { spaceRoutes } from "utils/routes";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
        publishPost,
    } = useSpaceAppState();
    const [friendRequestSentToastName, setFriendRequestSentToastName] =
        useState<string>();
    const [friendRequests, setFriendRequests] = useState<SpaceFriendRequest[]>(
        [],
    );
    const [latestPosts, setLatestPosts] = useState<SpacePost[]>([]);
    const [unreadPosts, setUnreadPosts] = useState<SpacePost[]>([]);
    const [hasUnreadMessages, setHasUnreadMessages] = useState<boolean>();
    const [isLatestPostsLoading, setIsLatestPostsLoading] = useState(true);
    const [isFriendsLoading, setIsFriendsLoading] = useState(true);
    const [isFriendRequestsLoading, setIsFriendRequestsLoading] =
        useState(true);
    const [showFriendRequestCanceledToast, setShowFriendRequestCanceledToast] =
        useState(false);
    const [showFriendLimitToast, setShowFriendLimitToast] = useState(false);
    const [spaceId, setSpaceId] = useState<string>();
    const closeFriendRequestSentToast = React.useCallback(
        () => setFriendRequestSentToastName(undefined),
        [],
    );
    const refreshUnreadStatus = React.useCallback(async (spaceId: string) => {
        try {
            const unreadStatus = await loadCurrentUnreadStatus(spaceId);
            setHasUnreadMessages(unreadStatus.messagesUnread);
        } catch (error: unknown) {
            log.error("Failed to refresh space unread status", error);
        }
    }, []);

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!router.isReady) return;

        const sentFriend = consumeSentSpaceInviteFriend();
        if (!sentFriend) return;

        setFriendRequestSentToastName(sentFriend.username.trim());
    }, [router.isReady]);

    useEffect(() => {
        const request = { cancelled: false };
        const isCancelled = () => request.cancelled;
        setSpaceId(undefined);
        setFriendRequests([]);
        setLatestPosts([]);
        setUnreadPosts([]);
        setHasUnreadMessages(undefined);
        setIsLatestPostsLoading(true);
        setIsFriendsLoading(true);
        setIsFriendRequestsLoading(true);
        void (async () => {
            try {
                const nextSpaceId = await loadExistingSpaceId();
                if (isCancelled()) return;

                setSpaceId(nextSpaceId);
                if (!nextSpaceId) {
                    setHasUnreadMessages(false);
                    return;
                }

                void loadCurrentUnreadStatus(nextSpaceId)
                    .then((unreadStatus) => {
                        if (!isCancelled()) {
                            setHasUnreadMessages(unreadStatus.messagesUnread);
                        }
                    })
                    .catch((error: unknown) =>
                        log.error("Failed to load space unread status", error),
                    );

                const [nextFriends, nextFriendRequests, savedHomePosts] =
                    await Promise.all([
                        loadCurrentSpaceFriends(nextSpaceId),
                        loadCurrentFriendRequests(nextSpaceId).catch(
                            (error: unknown) => {
                                log.error(
                                    "Failed to load Space friend requests",
                                    error,
                                );
                                return [];
                            },
                        ),
                        loadSpaceHomePosts(nextSpaceId),
                    ]);
                if (isCancelled()) return;

                setFriends(nextFriends);
                setFriendRequests(nextFriendRequests);
                setIsFriendsLoading(false);
                setIsFriendRequestsLoading(false);
                if (savedHomePosts) {
                    setLatestPosts(savedHomePosts.latestPosts);
                    setUnreadPosts(savedHomePosts.unreadPosts);
                    setIsLatestPostsLoading(false);
                }

                const refreshedHomePosts = await refreshSpaceHomePosts(
                    nextSpaceId,
                    nextFriends,
                );
                if (isCancelled() || !refreshedHomePosts) return;
                setLatestPosts(refreshedHomePosts.latestPosts);
                setUnreadPosts(refreshedHomePosts.unreadPosts);
            } catch (error) {
                log.error("Failed to load Space home posts", error);
            } finally {
                if (!isCancelled()) {
                    setIsLatestPostsLoading(false);
                    setIsFriendsLoading(false);
                    setIsFriendRequestsLoading(false);
                }
            }
        })();

        return () => {
            request.cancelled = true;
        };
    }, [setFriends]);

    const setLatestPostLiked = React.useCallback(
        async (postId: number, liked: boolean) => {
            if (!spaceId) throw new Error("Missing space.");

            await setCurrentPostLiked(spaceId, postId, liked);
            void patchCachedSpaceHomePost(spaceId, postId, {
                viewerLiked: liked,
            });
            setLatestPosts((currentItems) =>
                currentItems.map((item) =>
                    item.postId == postId
                        ? { ...item, viewerLiked: liked }
                        : item,
                ),
            );
            setUnreadPosts((currentItems) =>
                currentItems.map((item) =>
                    item.postId == postId
                        ? { ...item, viewerLiked: liked }
                        : item,
                ),
            );
        },
        [spaceId],
    );

    if (
        profileLoadStatus == "error" ||
        (profileLoadStatus == "ready" && !profile)
    ) {
        return (
            <SpaceRouteFallback
                background={spaceAppBackgroundColor}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={spaceAppBackgroundColor} />
            <HomeScreen
                latestPosts={latestPosts}
                unreadPosts={unreadPosts}
                friendRequestSentToastName={friendRequestSentToastName}
                friends={friends}
                friendRequests={friendRequests}
                hasUnreadMessages={hasUnreadMessages}
                isLatestPostsLoading={isLatestPostsLoading}
                isFriendsLoading={isFriendsLoading}
                isFriendRequestsLoading={isFriendRequestsLoading}
                profile={profile}
                profileLink={
                    profile
                        ? spaceInviteURL({ spaceUsername: profile.username })
                        : undefined
                }
                viewerSpaceId={spaceId ?? profile?.spaceId}
                showInstallPrompt={
                    profileLoadStatus == "ready" &&
                    Boolean(profile) &&
                    !isLatestPostsLoading &&
                    !isFriendsLoading
                }
                onFriendRequestSentToastClose={closeFriendRequestSentToast}
                onAcceptFriendRequest={async (requestID) => {
                    if (!profile?.spaceId) throw new Error("Missing space.");
                    const sentRequestCount = friendRequests.filter(
                        (request) => request.direction == "sent",
                    ).length;
                    if (
                        friends.length + sentRequestCount >=
                        maximumSpaceFriendCount
                    ) {
                        setShowFriendLimitToast(true);
                        return;
                    }

                    try {
                        await confirmCurrentFriendRequest(
                            profile.spaceId,
                            requestID,
                        );
                    } catch (error: unknown) {
                        if (isSpaceFriendLimitError(error)) {
                            setShowFriendLimitToast(true);
                            return;
                        }
                        if (!isFriendRequestCanceledError(error)) throw error;
                        setFriendRequests((currentRequests) =>
                            currentRequests.filter(
                                (request) => request.requestId != requestID,
                            ),
                        );
                        setShowFriendRequestCanceledToast(true);
                        await refreshUnreadStatus(profile.spaceId);
                        return;
                    }
                    const loadedFriends = await loadCurrentSpaceFriends(
                        profile.spaceId,
                    );
                    setFriendRequests((currentRequests) =>
                        currentRequests.filter(
                            (request) => request.requestId != requestID,
                        ),
                    );
                    setFriends(loadedFriends);
                    const refreshedHomePosts = await refreshSpaceHomePosts(
                        profile.spaceId,
                        loadedFriends,
                    );
                    if (refreshedHomePosts) {
                        setLatestPosts(refreshedHomePosts.latestPosts);
                        setUnreadPosts(refreshedHomePosts.unreadPosts);
                    }
                    await refreshUnreadStatus(profile.spaceId);
                }}
                onCreatePost={
                    profile
                        ? async (image, caption) => {
                              await publishPost(image, caption);
                          }
                        : undefined
                }
                onOpenFriend={(friendID, username) => {
                    const friend = friends.find(
                        (candidate) =>
                            candidate.id == friendID ||
                            candidate.spaceId == friendID,
                    );
                    const friendUsername = username || friend?.username;
                    if (friendUsername) {
                        void router.push(
                            spaceRoutes.friendPage,
                            spaceRoutes.friend(friendUsername),
                        );
                    }
                }}
                onLoadFriendAvatar={loadCurrentFriendAvatarURL}
                onLoadPostImage={loadCurrentSpacePostAssetURL}
                onOpenMessages={() => void router.push(spaceRoutes.messages)}
                onOpenFriendRequests={() =>
                    void router.push(spaceRoutes.friends)
                }
                onDiscardFriendRequest={async (requestID) => {
                    if (!profile?.spaceId) throw new Error("Missing space.");
                    const friendRequest = friendRequests.find(
                        (request) => request.requestId == requestID,
                    );

                    try {
                        await deleteCurrentFriendRequest(
                            profile.spaceId,
                            requestID,
                        );
                    } catch (error: unknown) {
                        if (!isFriendRequestCanceledError(error)) throw error;
                        clearSpaceFriendsCache();
                        const [requests, loadedFriends] = await Promise.all([
                            loadCurrentFriendRequests(profile.spaceId),
                            loadCurrentSpaceFriends(profile.spaceId),
                        ]);
                        setFriendRequests(requests);
                        setFriends(loadedFriends);
                        setShowFriendRequestCanceledToast(
                            !friendRequest ||
                                !loadedFriends.some(
                                    (friend) =>
                                        friend.id == friendRequest.friend.id,
                                ),
                        );
                        await refreshUnreadStatus(profile.spaceId);
                        return;
                    }
                    setFriendRequests((currentRequests) =>
                        currentRequests.filter(
                            (request) => request.requestId != requestID,
                        ),
                    );
                    await refreshUnreadStatus(profile.spaceId);
                }}
                onOpenProfile={
                    profile
                        ? () => void router.push(spaceRoutes.profile)
                        : undefined
                }
                onReplyToPost={
                    profile?.spaceId
                        ? (
                              (actorSpaceId) =>
                              (
                                  postSpaceId: string,
                                  postId: number,
                                  text: string,
                              ) =>
                                  replyToCurrentPost(
                                      actorSpaceId,
                                      postSpaceId,
                                      postId,
                                      text,
                                  )
                          )(profile.spaceId)
                        : undefined
                }
                onSetPostLiked={setLatestPostLiked}
            />
            {showFriendRequestCanceledToast && (
                <SpaceFriendRequestCanceledToast
                    onClose={() => setShowFriendRequestCanceledToast(false)}
                />
            )}
            {showFriendLimitToast && (
                <SpaceFriendLimitToast
                    onClose={() => setShowFriendLimitToast(false)}
                />
            )}
        </>
    );
};

export default Page;
