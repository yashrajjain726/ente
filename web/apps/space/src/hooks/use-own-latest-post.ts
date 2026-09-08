import log from "ente-base/log";
import { useCallback, useEffect, useState } from "react";
import { loadCachedOwnLatestPost } from "services/post-cache";
import {
    deleteCurrentPost,
    loadCurrentSpaceProfilePostsPage,
    updateCurrentPostCaption,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";

export const useOwnLatestPost = (spaceId: string | undefined) => {
    const { postPublication, setPostPublication } = useSpaceAppState();
    const isPublishingPost = postPublication?.phase == "posting";
    const [ownLatestPost, setOwnLatestPost] = useState<SpacePost>();
    const [ownPostsVersion, setOwnPostsVersion] = useState(0);
    const [isOwnLatestPostLoading, setIsOwnLatestPostLoading] = useState(true);
    const [isOwnLatestPostUnavailable, setIsOwnLatestPostUnavailable] =
        useState(false);

    useEffect(() => {
        setOwnLatestPost(undefined);
        setIsOwnLatestPostLoading(true);
        setIsOwnLatestPostUnavailable(false);
        if (!spaceId || isPublishingPost) return;

        let cancelled = false;
        let cachedPost: SpacePost | undefined;
        void loadCachedOwnLatestPost(spaceId)
            .then((post) => {
                if (cancelled) return;
                cachedPost = post;
                if (post) {
                    setOwnLatestPost(post);
                    setIsOwnLatestPostLoading(false);
                }
                return loadCurrentSpaceProfilePostsPage(spaceId, spaceId);
            })
            .then((page) => {
                if (!cancelled && page) setOwnLatestPost(page.items[0]);
            })
            .catch((error: unknown) => {
                log.error("Failed to load own latest Space post", error);
                if (!cancelled && !cachedPost)
                    setIsOwnLatestPostUnavailable(true);
            })
            .finally(() => {
                if (!cancelled) setIsOwnLatestPostLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [spaceId, ownPostsVersion, isPublishingPost]);

    const deleteOwnPost = useCallback(
        async (postId: number) => {
            if (!spaceId) throw new Error("Missing space.");

            await deleteCurrentPost(spaceId, postId);
            if (
                ownLatestPost?.postId == postId ||
                postPublication?.post.postId == postId
            ) {
                setPostPublication((current) =>
                    current?.post.postId == postId ? null : current,
                );
                setOwnLatestPost(undefined);
                setIsOwnLatestPostLoading(true);
                setOwnPostsVersion((version) => version + 1);
            }
        },
        [spaceId, ownLatestPost?.postId, postPublication, setPostPublication],
    );

    const updateOwnPostCaption = useCallback(
        async (postId: number, caption: string) => {
            if (!spaceId) throw new Error("Missing space.");

            await updateCurrentPostCaption(spaceId, postId, caption);
            setPostPublication((current) =>
                current?.post.postId == postId
                    ? {
                          ...current,
                          post: {
                              ...current.post,
                              caption: caption.trim() || undefined,
                          },
                      }
                    : current,
            );
            setOwnLatestPost((post) =>
                post?.postId == postId
                    ? { ...post, caption: caption.trim() || undefined }
                    : post,
            );
        },
        [spaceId, setPostPublication],
    );

    return {
        ownLatestPost: postPublication?.post ?? ownLatestPost,
        isOwnLatestPostLoading: !postPublication && isOwnLatestPostLoading,
        isOwnLatestPostUnavailable:
            !postPublication && isOwnLatestPostUnavailable,
        deleteOwnPost,
        updateOwnPostCaption,
    };
};
