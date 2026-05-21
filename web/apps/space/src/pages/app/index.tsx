import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import {
    createCurrentPhotoPost,
    createCurrentProfileLink,
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
import { firstNameFrom } from "utils/spaceDisplay";
import { spacePostToViewerPhoto } from "utils/spacePostDisplay";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        refreshProfile,
        setFriends,
    } = useSpaceAppState();
    const [addedFriendToastName, setAddedFriendToastName] = useState<string>();
    const [feedItems, setFeedItems] = useState<SpacePost[]>([]);
    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
    const [isFeedLoading, setIsFeedLoading] = useState(true);
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
            setHasUnreadNotifications(false);
            setIsFeedLoading(false);
            return;
        }

        let cancelled = false;
        setIsFeedLoading(true);
        void Promise.all([
            loadCurrentFeedPage(),
            loadCurrentUnreadStatus(),
            loadCurrentSpaceFriends(spaceId),
        ])
            .then(([feed, unreadStatus, nextFriends]) => {
                if (cancelled) return;
                setFeedItems(feed.items);
                setHasUnreadNotifications(unreadStatus.notificationsUnread);
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

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                actionLabel={profileLoadStatus == "error" ? "Retry" : undefined}
                background={homeBackground}
                message={profileLoadError}
                onAction={() => void refreshProfile()}
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
                hasUnreadNotifications={hasUnreadNotifications}
                isFeedLoading={isFeedLoading}
                profile={profile}
                onAddedFriendToastClose={closeAddedFriendToast}
                onCreatePost={async (image, caption) => {
                    if (!profile.spaceId) throw new Error("Missing space.");
                    const post = await createCurrentPhotoPost({
                        caption,
                        file: image.file,
                        height: image.height,
                        spaceId: profile.spaceId,
                        width: image.width,
                    });
                    if (!post) throw new Error("Couldn't create post.");
                    return spacePostToViewerPhoto(post);
                }}
                onOpenFriend={(friendID) =>
                    void router.push(spaceRoutes.friend(friendID))
                }
                onOpenNotifications={() =>
                    void router.push(spaceRoutes.notifications)
                }
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
