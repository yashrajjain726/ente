import {
    loadStoredSpacePostState,
    saveStoredSpacePostState,
} from "services/post-seen";
import {
    loadCurrentSpaceProfilePostsPage,
    type SpacePost,
} from "services/space";

export const loadUnseenSpacePosts = async (
    friendSpaceID: string,
    viewerSpaceID: string,
): Promise<SpacePost[]> => {
    const storedState = loadStoredSpacePostState(friendSpaceID);
    let page = await loadCurrentSpaceProfilePostsPage(
        friendSpaceID,
        viewerSpaceID,
    );
    const latestPostID = page.items[0]?.postId ?? 0;
    if (!storedState) {
        saveStoredSpacePostState(friendSpaceID, {
            latestKnownPostID: latestPostID,
            unreadPostIDs: [],
            version: 2,
        });
        return [];
    }

    const unreadPostIDs = new Set(storedState.unreadPostIDs);
    const unreadPostsByID = new Map<number, SpacePost>();

    while (true) {
        for (const post of page.items) {
            if (post.postId > storedState.latestKnownPostID) {
                unreadPostIDs.add(post.postId);
            }
            if (unreadPostIDs.has(post.postId) && !post.isUnavailable) {
                unreadPostsByID.set(post.postId, post);
            }
        }

        const oldestLoadedPostID = page.items.at(-1)?.postId;
        const hasMoreNewPosts =
            oldestLoadedPostID != undefined &&
            oldestLoadedPostID > storedState.latestKnownPostID;
        const hasMissingUnreadPosts = [...unreadPostIDs].some(
            (postID) => !unreadPostsByID.has(postID),
        );
        if (!page.nextCursor || (!hasMoreNewPosts && !hasMissingUnreadPosts)) {
            break;
        }
        page = await loadCurrentSpaceProfilePostsPage(
            friendSpaceID,
            viewerSpaceID,
            page.nextCursor,
        );
    }

    const unseenPosts = [...unreadPostsByID.values()].sort(
        (a, b) => b.timestampMs - a.timestampMs || b.postId - a.postId,
    );
    saveStoredSpacePostState(friendSpaceID, {
        latestKnownPostID: Math.max(
            storedState.latestKnownPostID,
            latestPostID,
        ),
        unreadPostIDs: unseenPosts.map((post) => post.postId),
        version: 2,
    });
    return unseenPosts;
};
