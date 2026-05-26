import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import {
    createCurrentPhotoPost,
    createCurrentProfileLink,
    deleteCurrentPost,
    loadCurrentFeedPage,
    loadCurrentPostLikers,
    loadCurrentSpaceFriends,
    loadCurrentUnreadStatus,
    markCurrentFeedRead,
    replyToCurrentPost,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { consumeAcceptedSpaceInviteFriend } from "services/spaceInvite";
import { useSpaceAppState } from "state/spaceAppState";
import {
    confirmLocalFeedPost,
    createLocalFeedPostID,
} from "utils/localFeedPost";
import { firstNameFrom } from "utils/spaceDisplay";
import { prepareSpacePostImageFromEdit } from "utils/spacePostImage";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        friends,
        localFeedPosts,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
        setLocalFeedPosts,
    } = useSpaceAppState();
    const [addedFriendToastName, setAddedFriendToastName] = useState<string>();
    const [feedItems, setFeedItems] = useState<SpacePost[]>([]);
    const [feedNextCursor, setFeedNextCursor] = useState<string>();
    const [hasUnreadMessages, setHasUnreadMessages] = useState<boolean>();
    const [isFeedLoading, setIsFeedLoading] = useState(true);
    const [isFeedLoadingMore, setIsFeedLoadingMore] = useState(false);
    const closeAddedFriendToast = React.useCallback(
        () => setAddedFriendToastName(undefined),
        [],
    );

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!router.isReady) return;

        const acceptedFriend = consumeAcceptedSpaceInviteFriend();
        if (!acceptedFriend) return;

        const displayName =
            acceptedFriend.fullName.trim() || acceptedFriend.username.trim();
        setAddedFriendToastName(firstNameFrom(displayName) || displayName);
    }, [router.isReady]);

    useEffect(() => {
        if (profileLoadStatus != "ready") return;

        const spaceId = profile?.spaceId;
        if (!spaceId) {
            setFeedItems([]);
            setFeedNextCursor(undefined);
            setHasUnreadMessages(false);
            setIsFeedLoading(false);
            setIsFeedLoadingMore(false);
            return;
        }

        let cancelled = false;
        setFeedItems([]);
        setFeedNextCursor(undefined);
        setHasUnreadMessages(undefined);
        setIsFeedLoading(true);
        setIsFeedLoadingMore(false);
        void Promise.all([
            loadCurrentFeedPage(),
            loadCurrentUnreadStatus(),
            loadCurrentSpaceFriends(spaceId),
        ])
            .then(([feed, unreadStatus, nextFriends]) => {
                if (cancelled) return;
                setFeedItems(feed.items);
                setFeedNextCursor(feed.nextCursor);
                setHasUnreadMessages(unreadStatus.messagesUnread);
                setFriends(nextFriends);
                const latestFeedPost = feed.items[0];
                if (latestFeedPost) {
                    void markCurrentFeedRead(latestFeedPost.postId).catch(
                        (error: unknown) =>
                            console.warn("Failed to mark feed read", error),
                    );
                }
            })
            .catch((error: unknown) =>
                console.error("Failed to load space home", error),
            )
            .finally(() => {
                if (!cancelled) setIsFeedLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.spaceId, profileLoadStatus, setFriends]);

    const loadMoreFeedItems = React.useCallback(async () => {
        if (!feedNextCursor || isFeedLoadingMore) return;

        setIsFeedLoadingMore(true);
        try {
            const feed = await loadCurrentFeedPage(feedNextCursor);
            setFeedItems((currentItems) => {
                const existingPostIds = new Set(
                    currentItems.map((item) => item.postId),
                );
                return [
                    ...currentItems,
                    ...feed.items.filter(
                        (item) => !existingPostIds.has(item.postId),
                    ),
                ];
            });
            setFeedNextCursor(feed.nextCursor);
        } catch (error) {
            console.error("Failed to load more space feed", error);
        } finally {
            setIsFeedLoadingMore(false);
        }
    }, [feedNextCursor, isFeedLoadingMore]);

    if (profileLoadStatus != "ready" || !profile) {
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
                feedItems={feedItems}
                friendsCount={friends.length}
                addedFriendToastName={addedFriendToastName}
                hasUnreadMessages={hasUnreadMessages}
                hasMoreFeedItems={Boolean(feedNextCursor)}
                isFeedLoading={isFeedLoading}
                isFeedLoadingMore={isFeedLoadingMore}
                localFeedPosts={localFeedPosts}
                profile={profile}
                onAddedFriendToastClose={closeAddedFriendToast}
                onCreatePost={async (image, caption) => {
                    const spaceId = profile.spaceId;
                    if (!spaceId) throw new Error("Missing space.");

                    const localPostId = createLocalFeedPostID();
                    const displayName =
                        profile.fullName.trim() || profile.username.trim();
                    setLocalFeedPosts((currentPosts) => [
                        {
                            avatarUrl: profile.avatarUrl,
                            caption: caption.trim() || undefined,
                            friendID: spaceId,
                            height: image.height,
                            id: localPostId,
                            imageUrl:
                                image.previewUrl ||
                                URL.createObjectURL(image.file),
                            name: displayName || "You",
                            spaceId,
                            status: "pending",
                            timestampMs: Date.now(),
                            width: image.width,
                        },
                        ...currentPosts,
                    ]);
                    try {
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
                            width: preparedImage.width,
                        });
                        if (!post) throw new Error("Couldn't create post.");
                        confirmLocalFeedPost(
                            setLocalFeedPosts,
                            localPostId,
                            post,
                        );
                        void markCurrentFeedRead(post.postId).catch(
                            (error: unknown) =>
                                console.warn("Failed to mark feed read", error),
                        );
                    } catch (error) {
                        setLocalFeedPosts((currentPosts) =>
                            currentPosts.filter(
                                (item) => item.id != localPostId,
                            ),
                        );
                        throw error;
                    }
                }}
                onDeletePost={async (postId) => {
                    await deleteCurrentPost(postId);
                    setLocalFeedPosts((currentPosts) =>
                        currentPosts.filter(
                            (item) =>
                                item.status == "pending" ||
                                item.post.postId != postId,
                        ),
                    );
                    setFeedItems((currentItems) =>
                        currentItems.filter((item) => item.postId != postId),
                    );
                }}
                onOpenFriend={(friendID) =>
                    void router.push(spaceRoutes.friend(friendID))
                }
                onLoadMoreFeedItems={loadMoreFeedItems}
                onOpenMessages={() => void router.push(spaceRoutes.messages)}
                onOpenProfile={() => void router.push(spaceRoutes.profile)}
                onLoadPostLikers={loadCurrentPostLikers}
                onReplyToPost={replyToCurrentPost}
                onSetPostLiked={setCurrentPostLiked}
                onShareProfileLink={async () => {
                    if (!profile.spaceId) throw new Error("Missing space.");
                    return (await createCurrentProfileLink(profile.spaceId))
                        .url;
                }}
            />
        </>
    );
};

export default Page;
