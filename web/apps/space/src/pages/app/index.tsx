import { SpacePageMeta } from "components/PageMeta";
import { SpaceRouteFallback } from "components/RouteFallback";
import log from "ente-base/log";
import React, { useEffect, useState } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import {
    patchCachedSpaceFeedPost,
    prependCachedSpaceFeedPost,
} from "services/feed-cache";
import { consumeSentSpaceInviteFriend } from "services/invite";
import { loadExistingSpaceId } from "services/profile";
import {
    createCurrentPhotoPost,
    loadCurrentSpaceFriends,
    loadCurrentSpaceLatestPost,
    loadCurrentSpacePostAssetURL,
    loadCurrentSpacePostAvatarURL,
    loadCurrentUnreadStatus,
    replyToCurrentPost,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";
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

                            setLatestPosts(
                                latestPosts.filter(
                                    (post): post is SpacePost => post !== null,
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
                viewerSpaceId={spaceId ?? profile?.spaceId}
                showInstallPrompt={
                    profileLoadStatus == "ready" &&
                    Boolean(profile) &&
                    !isLatestPostsLoading &&
                    !isFriendsLoading
                }
                onFriendRequestSentToastClose={closeFriendRequestSentToast}
                onInitialPostPhotoConsumed={() => setPendingPostPhotoFile(null)}
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
                onLoadPostAvatar={loadCurrentSpacePostAvatarURL}
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
            />
        </>
    );
};

export default Page;
