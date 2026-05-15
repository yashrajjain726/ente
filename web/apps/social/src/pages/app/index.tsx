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
    loadCurrentWallFriends,
    setCurrentPostLiked,
    type SocialWallPost,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { firstNameFrom } from "utils/socialDisplay";
import { socialRoutes } from "utils/socialRoutes";
import { socialPostToViewerPhoto } from "utils/socialWallDisplay";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();
    const [addedFriendToastName, setAddedFriendToastName] =
        useState<string>();
    const [feedItems, setFeedItems] = useState<SocialWallPost[]>([]);
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
            setIsFeedLoading(false);
            return;
        }

        let cancelled = false;
        setIsFeedLoading(true);
        void Promise.all([
            loadCurrentFeedPage(),
            loadCurrentWallFriends(wallId),
        ])
            .then(([feed, nextFriends]) => {
                if (cancelled) return;
                setFeedItems(feed.items);
                setFriends(nextFriends);
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

    if (profileLoadStatus == "loading" || !profile || isFeedLoading) {
        return <SocialRouteFallback background={homeBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={homeBackground} />
            <HomeScreen
                feedItems={feedItems}
                friendsCount={friends.length}
                addedFriendToastName={addedFriendToastName}
                isFeedLoading={isFeedLoading}
                profile={profile}
                onAddedFriendToastClose={closeAddedFriendToast}
                onCreatePost={async (file, caption) => {
                    if (!profile.wallId) throw new Error("Missing wall.");
                    const post = await createCurrentPhotoPost({
                        caption,
                        file,
                        wallId: profile.wallId,
                    });
                    if (!post) throw new Error("Couldn't create post.");
                    setFeedItems((currentItems) => [post, ...currentItems]);
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
                onSetPostLiked={setCurrentPostLiked}
                onShareProfileLink={async () => {
                    if (!profile.wallId) throw new Error("Missing wall.");
                    return (await createCurrentProfileLink(profile.wallId)).url;
                }}
            />
        </>
    );
};

export default Page;
