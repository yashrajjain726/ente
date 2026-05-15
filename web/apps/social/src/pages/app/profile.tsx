import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { ProfileScreen, profileBackground } from "screens/ProfileScreen";
import {
    createCurrentPhotoPost,
    createCurrentProfileLink,
    deleteCurrentPost,
    loadCurrentPostLikers,
    loadCurrentWallFriends,
    loadCurrentWallPostsPage,
    setCurrentPostLiked,
    type SocialWallPost,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";
import {
    profilePostGroupsFromPosts,
    socialPostToViewerPhoto,
} from "utils/socialWallDisplay";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSocialAppState();
    const [posts, setPosts] = useState<SocialWallPost[]>([]);
    const [isPostsLoading, setIsPostsLoading] = useState(true);
    const postGroups = useMemo(() => profilePostGroupsFromPosts(posts), [posts]);

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (profileLoadStatus == "loading") return;

        const wallId = profile?.wallId;
        if (!wallId) {
            setIsPostsLoading(false);
            return;
        }

        let cancelled = false;
        setIsPostsLoading(true);
        void Promise.all([
            loadCurrentWallPostsPage(wallId),
            loadCurrentWallFriends(wallId),
        ])
            .then(([page, nextFriends]) => {
                if (cancelled) return;
                setPosts(page.items);
                setFriends(nextFriends);
            })
            .catch((error: unknown) =>
                console.error("Failed to load social profile", error),
            )
            .finally(() => {
                if (!cancelled) setIsPostsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.wallId, profileLoadStatus, setFriends]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={profileBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={profileBackground} />
            <ProfileScreen
                friendsCount={friends.length}
                isPostsLoading={isPostsLoading}
                postGroups={postGroups}
                profile={profile}
                onBack={() => void router.push(socialRoutes.home)}
                onCreatePost={async (file, caption) => {
                    if (!profile.wallId) throw new Error("Missing wall.");
                    const post = await createCurrentPhotoPost({
                        caption,
                        file,
                        wallId: profile.wallId,
                    });
                    if (!post) throw new Error("Couldn't create post.");
                    setPosts((currentPosts) => [post, ...currentPosts]);
                    return socialPostToViewerPhoto(post);
                }}
                onDeletePost={async (postId) => {
                    await deleteCurrentPost(postId);
                    setPosts((currentPosts) =>
                        currentPosts.filter((post) => post.postId != postId),
                    );
                }}
                onOpenFriend={(friendID) =>
                    void router.push(socialRoutes.friend(friendID, "profile"))
                }
                onOpenFriends={() => void router.push(socialRoutes.friends)}
                onOpenSettings={() => void router.push(socialRoutes.settings)}
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
