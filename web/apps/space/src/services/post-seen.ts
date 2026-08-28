import type { FriendProfile } from "data/friends";
import type { SpacePost } from "services/space";

const storageKeyFor = (friendSpaceID: string) =>
    `space.posts.lastSeen.${friendSpaceID}`;

const storedPostID = (value: string | null) => {
    if (value === null) return undefined;

    const postID = Number(value);
    return Number.isSafeInteger(postID) && postID >= 0 ? postID : undefined;
};

export const loadUnseenSpacePostIDs = (
    friends: FriendProfile[],
    latestPosts: SpacePost[],
) => {
    const latestPostBySpaceID = new Map(
        latestPosts.map((post) => [post.spaceId, post]),
    );
    const unseenPostIDs = new Set<number>();

    try {
        for (const friend of friends) {
            const friendSpaceID = friend.spaceId ?? friend.id;
            const latestPost = latestPostBySpaceID.get(friendSpaceID);
            const storageKey = storageKeyFor(friendSpaceID);
            const lastSeenPostID = storedPostID(
                localStorage.getItem(storageKey),
            );

            if (lastSeenPostID === undefined) {
                localStorage.setItem(
                    storageKey,
                    String(latestPost?.postId ?? 0),
                );
            } else if (latestPost && latestPost.postId > lastSeenPostID) {
                unseenPostIDs.add(latestPost.postId);
            }
        }
    } catch {
        unseenPostIDs.clear();
    }

    return unseenPostIDs;
};

export const markSpacePostSeen = (friendSpaceID: string, postID: number) => {
    try {
        const storageKey = storageKeyFor(friendSpaceID);
        const lastSeenPostID = storedPostID(localStorage.getItem(storageKey));
        if (lastSeenPostID === undefined || postID > lastSeenPostID) {
            localStorage.setItem(storageKey, String(postID));
        }
    } catch {
        return;
    }
};
