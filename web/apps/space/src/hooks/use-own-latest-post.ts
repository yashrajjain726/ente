import log from "ente-base/log";
import { useEffect, useState } from "react";
import { savedSpaceOwnedSpaces } from "services/persistent-session";
import { loadCachedOwnLatestPost } from "services/post-cache";
import { loadExistingSpaceId } from "services/profile";
import {
    loadCurrentSpaceProfilePostsPage,
    type SpacePost,
} from "services/space";
import { useSpaceAppState } from "state/app-state";

export const useOwnLatestPost = () => {
    const { postPublication } = useSpaceAppState();
    const isPublishingPost = postPublication?.phase == "posting";
    const [ownLatestPost, setOwnLatestPost] = useState<SpacePost>();
    const [isOwnLatestPostLoading, setIsOwnLatestPostLoading] = useState(true);
    const [isOwnLatestPostUnavailable, setIsOwnLatestPostUnavailable] =
        useState(false);

    useEffect(() => {
        setIsOwnLatestPostLoading(true);
        setIsOwnLatestPostUnavailable(false);
        if (isPublishingPost) return;

        let cancelled = false;
        const isCancelled = () => cancelled;
        let cachedPost: SpacePost | undefined;
        void (async () => {
            const cachedSpaceId = savedSpaceOwnedSpaces()?.[0]?.spaceId;
            if (cachedSpaceId) {
                cachedPost = await loadCachedOwnLatestPost(cachedSpaceId);
                if (isCancelled()) return;
                if (cachedPost) {
                    setOwnLatestPost(cachedPost);
                    setIsOwnLatestPostLoading(false);
                }
            }

            const spaceId = await loadExistingSpaceId();
            if (isCancelled()) return;
            if (cachedPost?.spaceId != spaceId) {
                cachedPost = undefined;
                setOwnLatestPost(undefined);
                setIsOwnLatestPostLoading(true);
            }
            if (!spaceId) return;

            const page = await loadCurrentSpaceProfilePostsPage(
                spaceId,
                spaceId,
            );
            if (!isCancelled()) setOwnLatestPost(page.items[0]);
        })()
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
    }, [isPublishingPost]);

    return {
        ownLatestPost: postPublication?.post ?? ownLatestPost,
        isOwnLatestPostLoading: !postPublication && isOwnLatestPostLoading,
        isOwnLatestPostUnavailable:
            !postPublication && isOwnLatestPostUnavailable,
    };
};
