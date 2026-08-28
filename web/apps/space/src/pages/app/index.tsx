import { SpacePageMeta } from "components/PageMeta";
import { SpaceRouteFallback } from "components/RouteFallback";
import type { FriendProfile } from "data/friends";
import log from "ente-base/log";
import React, { useEffect, useState } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import {
    patchCachedSpaceFeedPost,
    prependCachedSpaceFeedPost,
} from "services/feed-cache";
import { consumeSentSpaceInviteFriend } from "services/invite";
import { loadUnseenSpacePostIDs, markSpacePostSeen } from "services/post-seen";
import { loadExistingSpaceId } from "services/profile";
import {
    createCurrentPhotoPost,
    loadCurrentFriendAvatarURL,
    loadCurrentSpaceFriends,
    loadCurrentSpaceLatestPost,
    loadCurrentSpacePostAssetURL,
    loadCurrentUnreadStatus,
    replyToCurrentPost,
    sendCurrentMessage,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";
import { spaceWaveMessageText } from "utils/message-limits";
import { prepareSpacePostImageFromEdit } from "utils/post-image";
import { useSpaceRouter } from "utils/route-transitions";
import { spaceRoutes } from "utils/routes";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const {
        friends,
        pendingPostPhotoFile,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
        setPendingPostPhotoFile,
    } = useSpaceAppState();
    const [friendRequestSentToastName, setFriendRequestSentToastName] =
        useState<string>();
    const [latestPosts, setLatestPosts] = useState<SpacePost[]>([]);
    const [unseenPostIDs, setUnseenPostIDs] = useState<Set<number>>(new Set());
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
        let cancelled = false;
        setSpaceId(undefined);
        setLatestPosts([]);
        setUnseenPostIDs(new Set());
        setHasUnreadMessages(undefined);
        setIsLatestPostsLoading(true);
        setIsFriendsLoading(true);
        void loadExistingSpaceId()
            .then((nextSpaceId) => {
                if (cancelled) return;

                setSpaceId(nextSpaceId);
                if (!nextSpaceId) {
                    setHasUnreadMessages(false);
                    return;
                }

                void loadCurrentUnreadStatus(nextSpaceId)
                    .then((unreadStatus) => {
                        if (!cancelled) {
                            setHasUnreadMessages(unreadStatus.messagesUnread);
                        }
                    })
                    .catch((error: unknown) =>
                        log.error("Failed to load space unread status", error),
                    );

                return loadCurrentSpaceFriends(nextSpaceId).then(
                    (nextFriends) => {
                        if (cancelled) return;

                        setFriends(nextFriends);
                        setIsFriendsLoading(false);
                        return Promise.all(
                            nextFriends.map(async (friend) => {
                                if (!friend.spaceId) return null;
                                try {
                                    return await loadCurrentSpaceLatestPost(
                                        friend.spaceId,
                                        nextSpaceId,
                                    );
                                } catch (error) {
                                    log.warn(
                                        `Failed to load latest post for ${friend.id}`,
                                        error,
                                    );
                                    return null;
                                }
                            }),
                        ).then((latestPosts) => {
                            if (cancelled) return;

                            const nextLatestPosts = latestPosts.filter(
                                (post): post is SpacePost => post !== null,
                            );
                            setLatestPosts(nextLatestPosts);
                            setUnseenPostIDs(
                                loadUnseenSpacePostIDs(
                                    nextFriends,
                                    nextLatestPosts,
                                ),
                            );
                        });
                    },
                );
            })
            .catch((error: unknown) =>
                log.error("Failed to load space friends", error),
            )
            .finally(() => {
                if (cancelled) return;

                setIsLatestPostsLoading(false);
                setIsFriendsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [setFriends]);

    const setLatestPostLiked = React.useCallback(
        async (postId: number, liked: boolean) => {
            if (!spaceId) throw new Error("Missing space.");

            await setCurrentPostLiked(spaceId, postId, liked);
            void patchCachedSpaceFeedPost(spaceId, postId, {
                viewerLiked: liked,
            });
            setLatestPosts((currentItems) =>
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
                background={homeBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={homeBackground} />
            <HomeScreen
                latestPosts={latestPosts}
                friendRequestSentToastName={friendRequestSentToastName}
                friends={friends}
                hasUnreadMessages={hasUnreadMessages}
                initialPostPhotoFile={pendingPostPhotoFile}
                isLatestPostsLoading={isLatestPostsLoading}
                isFriendsLoading={isFriendsLoading}
                profile={profile}
                unseenPostIDs={unseenPostIDs}
                viewerSpaceId={spaceId ?? profile?.spaceId}
                showInstallPrompt={
                    profileLoadStatus == "ready" &&
                    Boolean(profile) &&
                    !isLatestPostsLoading &&
                    !isFriendsLoading
                }
                onFriendRequestSentToastClose={closeFriendRequestSentToast}
                onInitialPostPhotoConsumed={() => setPendingPostPhotoFile(null)}
                onLoadFriendAvatar={loadCurrentFriendAvatarURL}
                onCreatePost={
                    profile
                        ? async (image, caption) => {
                              const spaceId = profile.spaceId;
                              if (!spaceId) throw new Error("Missing space.");

                              const preparedImage =
                                  await prepareSpacePostImageFromEdit(
                                      image.file,
                                      image.cropArea,
                                      image.rotationDegrees,
                                  );
                              const post = await createCurrentPhotoPost({
                                  caption,
                                  file: preparedImage.file,
                                  height: preparedImage.height,
                                  spaceId,
                                  thumbHash: preparedImage.thumbHash,
                                  width: preparedImage.width,
                              });
                              void prependCachedSpaceFeedPost(spaceId, post);
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
                onLoadPostImage={loadCurrentSpacePostAssetURL}
                onPostSeen={(friendSpaceID, postID) => {
                    markSpacePostSeen(friendSpaceID, postID);
                    setUnseenPostIDs((currentPostIDs) => {
                        if (!currentPostIDs.has(postID)) return currentPostIDs;

                        const nextPostIDs = new Set(currentPostIDs);
                        nextPostIDs.delete(postID);
                        return nextPostIDs;
                    });
                }}
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
