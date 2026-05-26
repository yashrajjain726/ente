import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import { ProfileScreen, profileBackground } from "screens/ProfileScreen";
import {
    createCurrentPhotoPost,
    createCurrentProfileLink,
    deleteCurrentPost,
    loadCurrentPostLikers,
    loadCurrentSpaceFriends,
    loadCurrentSpacePostsPage,
    markCurrentFeedRead,
    setCurrentPostLiked,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { createLocalFeedPostID } from "utils/localFeedPost";
import { profilePostGroupsFromPosts } from "utils/spacePostDisplay";
import { prepareSpacePostImageFromEdit } from "utils/spacePostImage";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
        setLocalFeedPosts,
    } = useSpaceAppState();
    const [posts, setPosts] = useState<SpacePost[]>([]);
    const [isPostsLoading, setIsPostsLoading] = useState(true);
    const postGroups = useMemo(
        () => profilePostGroupsFromPosts(posts),
        [posts],
    );

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (profileLoadStatus != "ready") return;

        const spaceId = profile?.spaceId;
        if (!spaceId) {
            setIsPostsLoading(false);
            return;
        }

        let cancelled = false;
        setIsPostsLoading(true);
        void Promise.all([
            loadCurrentSpacePostsPage(spaceId),
            loadCurrentSpaceFriends(spaceId),
        ])
            .then(([page, nextFriends]) => {
                if (cancelled) return;
                setPosts(page.items);
                setFriends(nextFriends);
            })
            .catch((error: unknown) =>
                console.error("Failed to load space profile", error),
            )
            .finally(() => {
                if (!cancelled) setIsPostsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.spaceId, profileLoadStatus, setFriends]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={profileBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={profileBackground} />
            <ProfileScreen
                friendsCount={friends.length}
                isPostsLoading={isPostsLoading}
                postGroups={postGroups}
                profile={profile}
                onBack={() => void router.push(spaceRoutes.home)}
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
                        setLocalFeedPosts((currentPosts) =>
                            currentPosts.map((item) =>
                                item.id == localPostId
                                    ? { id: localPostId, post, status: "ready" }
                                    : item,
                            ),
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
                onDraftPostPublished={() => void router.push(spaceRoutes.home)}
                onDeletePost={async (postId) => {
                    await deleteCurrentPost(postId);
                    setLocalFeedPosts((currentPosts) =>
                        currentPosts.filter(
                            (item) =>
                                item.status != "ready" ||
                                item.post.postId != postId,
                        ),
                    );
                    setPosts((currentPosts) =>
                        currentPosts.filter((post) => post.postId != postId),
                    );
                }}
                onOpenFriend={(friendID) =>
                    void router.push(spaceRoutes.friend(friendID))
                }
                onOpenFriends={() => void router.push(spaceRoutes.friends)}
                onOpenProfileCover={() =>
                    void router.push(spaceRoutes.profileCover)
                }
                onOpenProfilePhoto={() =>
                    void router.push(spaceRoutes.profilePhoto)
                }
                onOpenSettings={() => void router.push(spaceRoutes.settings)}
                onLoadPostLikers={loadCurrentPostLikers}
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
