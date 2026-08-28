import type { FriendProfile } from "data/friends";
import type { SpacePost } from "services/space";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { loadUnseenSpacePostIDs, markSpacePostSeen } from "./post-seen";

const values = new Map<string, string>();
const storage: Storage = {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
        return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
};

const friend = (spaceId: string): FriendProfile => ({
    friendsCount: 0,
    fullName: spaceId,
    id: spaceId,
    spaceId,
    username: spaceId,
});

const post = (spaceId: string, postId: number): SpacePost => ({
    friendID: spaceId,
    name: spaceId,
    postId,
    spaceId,
    timestampMs: 0,
    viewerLiked: false,
});

describe("Space post seen state", () => {
    beforeEach(() => {
        values.clear();
        vi.stubGlobal("localStorage", storage);
    });

    test("uses the current latest post as the first baseline", () => {
        const alice = friend("alice");

        expect(loadUnseenSpacePostIDs([alice], [post("alice", 10)])).toEqual(
            new Set(),
        );
        expect(loadUnseenSpacePostIDs([alice], [post("alice", 11)])).toEqual(
            new Set([11]),
        );
    });

    test("detects the first post from a friend who had no posts", () => {
        const alice = friend("alice");

        expect(loadUnseenSpacePostIDs([alice], [])).toEqual(new Set());
        expect(loadUnseenSpacePostIDs([alice], [post("alice", 1)])).toEqual(
            new Set([1]),
        );
    });

    test("stops returning a post after it is marked seen", () => {
        const alice = friend("alice");
        loadUnseenSpacePostIDs([alice], [post("alice", 10)]);

        expect(loadUnseenSpacePostIDs([alice], [post("alice", 11)])).toEqual(
            new Set([11]),
        );
        markSpacePostSeen("alice", 11);
        expect(loadUnseenSpacePostIDs([alice], [post("alice", 11)])).toEqual(
            new Set(),
        );
    });

    test("does not treat an older replacement post as unseen", () => {
        const alice = friend("alice");
        loadUnseenSpacePostIDs([alice], [post("alice", 10)]);

        expect(loadUnseenSpacePostIDs([alice], [post("alice", 9)])).toEqual(
            new Set(),
        );
    });
});
