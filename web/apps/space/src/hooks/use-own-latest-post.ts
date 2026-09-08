import log from "ente-base/log";
import { useCallback, useEffect, useState } from "react";
import {
    deleteCurrentPost,
    loadCurrentSpaceProfilePostsPage,
    updateCurrentPostCaption,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";

export const useOwnLatestPost = () => {
    const { profile, profileLoadStatus } = useSpaceAppState();
    const spaceId = profile?.spaceId;
    const [ownLatestPost, setOwnLatestPost] = useState<SpacePost>();
    const [ownPostsVersion, setOwnPostsVersion] = useState(0);
    const [isOwnLatestPostLoading, setIsOwnLatestPostLoading] = useState(true);
    const [isOwnLatestPostUnavailable, setIsOwnLatestPostUnavailable] =
        useState(false);

    useEffect(() => {
        if (profileLoadStatus != "ready") return;

        setOwnLatestPost(undefined);
        setIsOwnLatestPostLoading(Boolean(spaceId));
        setIsOwnLatestPostUnavailable(false);
        if (!spaceId) return;

        let cancelled = false;
        void loadCurrentSpaceProfilePostsPage(spaceId, spaceId)
            .then((page) => {
                if (!cancelled) setOwnLatestPost(page.items[0]);
            })
            .catch((error: unknown) => {
                log.error("Failed to load own latest Space post", error);
                if (!cancelled) setIsOwnLatestPostUnavailable(true);
            })
            .finally(() => {
                if (!cancelled) setIsOwnLatestPostLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [spaceId, profileLoadStatus, ownPostsVersion]);

    const setCreatedPost = useCallback((post: SpacePost) => {
        setOwnLatestPost(post);
        setIsOwnLatestPostLoading(false);
        setIsOwnLatestPostUnavailable(false);
    }, []);

    const deleteOwnPost = useCallback(
        async (postId: number) => {
            if (!spaceId) throw new Error("Missing space.");

            await deleteCurrentPost(spaceId, postId);
            if (ownLatestPost?.postId == postId) {
                setOwnLatestPost(undefined);
                setIsOwnLatestPostLoading(true);
                setOwnPostsVersion((version) => version + 1);
            }
        },
        [spaceId, ownLatestPost?.postId],
    );

    const updateOwnPostCaption = useCallback(
        async (postId: number, caption: string) => {
            if (!spaceId) throw new Error("Missing space.");

            await updateCurrentPostCaption(spaceId, postId, caption);
            setOwnLatestPost((post) =>
                post?.postId == postId
                    ? { ...post, caption: caption.trim() || undefined }
                    : post,
            );
        },
        [spaceId],
    );

    return {
        ownLatestPost,
        isOwnLatestPostLoading,
        isOwnLatestPostUnavailable,
        setCreatedPost,
        deleteOwnPost,
        updateOwnPostCaption,
    };
};
