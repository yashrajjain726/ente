import type { FriendProfile } from "data/friends";
import type { SpacePost } from "services/space";

export interface StoredSpacePostState {
    latestKnownPostID: number;
    unreadPostIDs: number[];
    version: 2;
}

const storageKeyFor = (friendSpaceID: string) =>
    `space.posts.lastSeen.${friendSpaceID}`;

const validPostID = (value: unknown): value is number =>
    typeof value == "number" && Number.isSafeInteger(value) && value >= 0;

const storedPostState = (value: string | null) => {
    if (value === null) return undefined;

    const legacyPostID = Number(value);
    if (validPostID(legacyPostID)) {
        return {
            latestKnownPostID: legacyPostID,
            unreadPostIDs: [],
            version: 2,
        } satisfies StoredSpacePostState;
    }

    try {
        const parsed = JSON.parse(value) as Partial<StoredSpacePostState>;
        if (
            parsed.version != 2 ||
            !validPostID(parsed.latestKnownPostID) ||
            !Array.isArray(parsed.unreadPostIDs) ||
            !parsed.unreadPostIDs.every(validPostID)
        ) {
            return undefined;
        }

        return {
            latestKnownPostID: parsed.latestKnownPostID,
            unreadPostIDs: [...new Set(parsed.unreadPostIDs)],
            version: 2,
        } satisfies StoredSpacePostState;
    } catch {
        return undefined;
    }
};

export const loadStoredSpacePostState = (friendSpaceID: string) =>
    storedPostState(localStorage.getItem(storageKeyFor(friendSpaceID)));

export const saveStoredSpacePostState = (
    friendSpaceID: string,
    state: StoredSpacePostState,
) => localStorage.setItem(storageKeyFor(friendSpaceID), JSON.stringify(state));

export const loadUnseenSpacePostIDs = (
    friends: FriendProfile[],
    latestPosts: SpacePost[],
) => {
    const latestPostBySpaceID = new Map(
        latestPosts.map((post) => [post.spaceId, post]),
    );
    const unseenPostIDs = new Set<number>();

    for (const friend of friends) {
        const friendSpaceID = friend.spaceId ?? friend.id;
        const latestPost = latestPostBySpaceID.get(friendSpaceID);
        const storedState = loadStoredSpacePostState(friendSpaceID);
        if (!storedState) {
            saveStoredSpacePostState(friendSpaceID, {
                latestKnownPostID: latestPost?.postId ?? 0,
                unreadPostIDs: [],
                version: 2,
            });
        } else if (
            latestPost &&
            latestPost.postId > storedState.latestKnownPostID
        ) {
            unseenPostIDs.add(latestPost.postId);
        }
    }

    return unseenPostIDs;
};

export const markSpacePostSeen = (friendSpaceID: string, postID: number) => {
    const storedState = loadStoredSpacePostState(friendSpaceID);
    saveStoredSpacePostState(friendSpaceID, {
        latestKnownPostID: Math.max(
            storedState?.latestKnownPostID ?? 0,
            postID,
        ),
        unreadPostIDs:
            storedState?.unreadPostIDs.filter(
                (unreadPostID) => unreadPostID != postID,
            ) ?? [],
        version: 2,
    });
};
