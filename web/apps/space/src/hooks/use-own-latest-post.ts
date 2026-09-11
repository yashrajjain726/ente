import log from "ente-base/log";
import { useEffect, useState } from "react";
import { loadCachedOwnLatestPost } from "services/post-cache";
import {
    loadCurrentSpaceProfilePostsPage,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";

export const useOwnLatestPost = (spaceId: string | undefined) => {
    const { postPublication } = useSpaceAppState();
    const isPublishingPost = postPublication?.phase == "posting";
    const [ownLatestPost, setOwnLatestPost] = useState<SpacePost>();
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
    }, [spaceId, isPublishingPost]);

    return {
        ownLatestPost: postPublication?.post ?? ownLatestPost,
        isOwnLatestPostLoading: !postPublication && isOwnLatestPostLoading,
        isOwnLatestPostUnavailable:
            !postPublication && isOwnLatestPostUnavailable,
    };
};
