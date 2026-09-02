import { SpacePageMeta } from "components/PageMeta";
import { SpaceRouteFallback } from "components/RouteFallback";
import type { FriendProfile } from "data/friends";
import log from "ente-base/log";
import React, { useEffect, useState } from "react";
import { HomeScreen } from "screens/HomeScreen";
import {
    loadSpaceHomePosts,
    patchCachedSpaceHomePost,
    refreshSpaceHomePosts,
} from "services/home-posts";
import { consumeSentSpaceInviteFriend } from "services/invite";
import { loadExistingSpaceId } from "services/profile";
import {
    loadCurrentFriendAvatarURL,
    loadCurrentSpaceFriends,
    loadCurrentSpacePostAssetURL,
    loadCurrentUnreadStatus,
    replyToCurrentPost,
    sendCurrentMessage,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";
import { spaceAppBackgroundColor } from "styles/colors";
import { spaceWaveMessageText } from "utils/message-limits";
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
    const [latestPosts, setLatestPosts] = useState<SpacePost[]>([]);
    const [unreadPosts, setUnreadPosts] = useState<SpacePost[]>([]);
    const [hasUnreadMessages, setHasUnreadMessages] = useState<boolean>();
    const [isLatestPostsLoading, setIsLatestPostsLoading] = useState(true);
    const [isFriendsLoading, setIsFriendsLoading] = useState(true);
    const [spaceId, setSpaceId] = useState<string>();
    const closeFriendRequestSentToast = React.useCallback(
        () => setFriendRequestSentToastName(undefined),
        [],
    );

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
        setLatestPosts([]);
        setUnreadPosts([]);
        setHasUnreadMessages(undefined);
        setIsLatestPostsLoading(true);
        setIsFriendsLoading(true);
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

                const [nextFriends, savedHomePosts] = await Promise.all([
                    loadCurrentSpaceFriends(nextSpaceId),
                    loadSpaceHomePosts(nextSpaceId),
                ]);
                if (isCancelled()) return;

                setFriends(nextFriends);
                setIsFriendsLoading(false);
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

    const waveAtFriend = async (friend: FriendProfile) => {
        if (!profile?.spaceId) throw new Error("Missing space.");

        await sendCurrentMessage(
            profile.spaceId,
            friend.spaceId ?? friend.id,
            spaceWaveMessageText,
            {
                avatarKeyVersion: profile.avatarKeyVersion,
                avatarObjectID: profile.avatarObjectID,
                avatarUpdatedAt: profile.avatarUpdatedAt,
                avatarUrl: profile.avatarUrl,
                friendsCount: 0,
                fullName: profile.fullName,
                id: profile.spaceId,
                spaceId: profile.spaceId,
                spaceSlug: profile.spaceSlug,
                username: profile.username,
            },
            friend,
        );
    };

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
                hasUnreadMessages={hasUnreadMessages}
                isLatestPostsLoading={isLatestPostsLoading}
                isFriendsLoading={isFriendsLoading}
                profile={profile}
                viewerSpaceId={spaceId ?? profile?.spaceId}
                showInstallPrompt={
                    profileLoadStatus == "ready" &&
                    Boolean(profile) &&
                    !isLatestPostsLoading &&
                    !isFriendsLoading
                }
                onFriendRequestSentToastClose={closeFriendRequestSentToast}
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
                onWaveFriend={profile?.spaceId ? waveAtFriend : undefined}
            />
        </>
    );
};

export default Page;
