import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { HomeScreen, homeBackground } from "screens/HomeScreen";
import { consumeAcceptedSocialInviteFriend } from "services/socialInvite";
import {
    createCurrentPhotoPost,
    createCurrentProfileLink,
    loadCurrentFeedPage,
    loadCurrentPostLikers,
    loadCurrentUnreadStatus,
    loadCurrentWallFriends,
    markCurrentFeedRead,
    replyToCurrentPost,
    setCurrentPostLiked,
    type SocialWallPost,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { firstNameFrom } from "utils/socialDisplay";
import { socialRoutes } from "utils/socialRoutes";
import { socialPostToViewerPhoto } from "utils/socialWallDisplay";

const loadingHomeProfile = { avatarUrl: null, fullName: "", username: "" };

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();
    const [addedFriendToastName, setAddedFriendToastName] = useState<string>();
    const [feedItems, setFeedItems] = useState<SocialWallPost[]>([]);
    const [hasUnreadNotifications, setHasUnreadNotifications] =
        useState(false);
    const [isFeedLoading, setIsFeedLoading] = useState(true);
    const closeAddedFriendToast = React.useCallback(
        () => setAddedFriendToastName(undefined),
        [],
    );

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (!router.isReady) return;

        const acceptedFriend = consumeAcceptedSocialInviteFriend();
        if (!acceptedFriend) return;

        const displayName =
            acceptedFriend.fullName.trim() || acceptedFriend.username.trim();
        setAddedFriendToastName(firstNameFrom(displayName) || displayName);
    }, [router.isReady]);

    useEffect(() => {
        if (profileLoadStatus == "loading") return;

        const wallId = profile?.wallId;
        if (!wallId) {
            setHasUnreadNotifications(false);
            setIsFeedLoading(false);
            return;
        }

        let cancelled = false;
        setIsFeedLoading(true);
        void Promise.all([
            loadCurrentFeedPage(),
            loadCurrentUnreadStatus(),
            loadCurrentWallFriends(wallId),
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
                console.error("Failed to load social home", error),
            )
            .finally(() => {
                if (!cancelled) setIsFeedLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.wallId, profileLoadStatus, setFriends]);

    if (profileLoadStatus == "ready" && !profile) {
        return <SocialRouteFallback background={homeBackground} />;
    }

    const screenProfile = profile ?? loadingHomeProfile;

    return (
        <>
            <SocialPageMeta themeColor={homeBackground} />
            <HomeScreen
                feedItems={feedItems}
                friendsCount={friends.length}
                addedFriendToastName={addedFriendToastName}
                hasUnreadNotifications={hasUnreadNotifications}
                isFeedLoading={isFeedLoading}
                profile={screenProfile}
                onAddedFriendToastClose={closeAddedFriendToast}
                onCreatePost={async (image, caption) => {
                    if (!profile?.wallId) throw new Error("Missing wall.");
                    const post = await createCurrentPhotoPost({
                        caption,
                        file: image.file,
                        height: image.height,
                        wallId: profile.wallId,
                        width: image.width,
                    });
                    if (!post) throw new Error("Couldn't create post.");
                    return socialPostToViewerPhoto(post);
                }}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID, "home"))
                }
                onOpenNotifications={() =>
                    void router.push(socialRoutes.notifications)
                }
                onOpenProfile={() => void router.push(socialRoutes.profile)}
                onLoadPostLikers={loadCurrentPostLikers}
                onReplyToPost={replyToCurrentPost}
                onSetPostLiked={setCurrentPostLiked}
                onShareProfileLink={async () => {
                    if (!profile?.wallId) throw new Error("Missing wall.");
                    return (await createCurrentProfileLink(profile.wallId)).url;
                }}
            />
        </>
    );
};

export default Page;
