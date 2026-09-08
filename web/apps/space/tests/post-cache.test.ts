import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { getKV, removeKV, setKV } from "ente-base/kv";
import { apiOrigin } from "ente-base/origins";
import { beforeEach, expect, test, vi } from "vitest";
import {
    cacheOwnLatestPost,
    loadCachedOwnLatestPost,
    patchCachedOwnLatestPost,
} from "../src/services/post-cache";
import type { SpacePost } from "../src/services/space";

vi.mock("ente-accounts/services/accounts-db", () => ({
    savedPartialLocalUser: vi.fn(),
}));
vi.mock("ente-base/kv", () => ({
    getKV: vi.fn(),
    setKV: vi.fn(),
    removeKV: vi.fn(),
}));
vi.mock("ente-base/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("ente-base/origins", () => ({ apiOrigin: vi.fn() }));

const storage = new Map<string, unknown>();
const post: SpacePost = {
    avatarUrl: "blob:avatar",
    caption: "A photo",
    friendID: "self",
    imageAsset: {
        encryptedPostKey: "encrypted-key",
        keyVersion: 1,
        objectKey: "photo",
        postId: 1,
        spaceId: "self",
    },
    imageUrl: "blob:photo",
    name: "Me",
    postId: 1,
    spaceId: "self",
    thumbHash: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
    timestampMs: 1,
    viewerLiked: false,
};

beforeEach(() => {
    vi.resetAllMocks();
    storage.clear();
    vi.mocked(savedPartialLocalUser).mockReturnValue({ id: 1 });
    vi.mocked(apiOrigin).mockResolvedValue("https://api.example.com");
    vi.mocked(getKV).mockImplementation((key) =>
        Promise.resolve(storage.get(key)),
    );
    vi.mocked(setKV).mockImplementation((key, value) => {
        storage.set(key, structuredClone(value));
        return Promise.resolve();
    });
    vi.mocked(removeKV).mockImplementation((key) => {
        storage.delete(key);
        return Promise.resolve();
    });
});

test("restores the hash and image asset without expired blob URLs", async () => {
    await cacheOwnLatestPost("self", post);
    const restored = await loadCachedOwnLatestPost("self");
    expect(restored?.thumbHash).toBe(post.thumbHash);
    expect(restored?.imageAsset).toEqual(post.imageAsset);
    expect(restored).not.toHaveProperty("imageUrl");
    expect(restored).not.toHaveProperty("avatarUrl");
});

test("keeps previews separate across spaces, accounts, and servers", async () => {
    await cacheOwnLatestPost("self", post);
    expect(await loadCachedOwnLatestPost("another-space")).toBeUndefined();
    vi.mocked(savedPartialLocalUser).mockReturnValue({ id: 2 });
    expect(await loadCachedOwnLatestPost("self")).toBeUndefined();
    vi.mocked(savedPartialLocalUser).mockReturnValue({ id: 1 });
    vi.mocked(apiOrigin).mockResolvedValue("https://other.example.com");
    expect(await loadCachedOwnLatestPost("self")).toBeUndefined();
});

test("updates captions and removes deleted posts without clearing newer posts", async () => {
    await cacheOwnLatestPost("self", post);
    await patchCachedOwnLatestPost("self", 1, { caption: "Edited" });
    expect((await loadCachedOwnLatestPost("self"))?.caption).toBe("Edited");
    await cacheOwnLatestPost("self", { ...post, postId: 2 });
    await patchCachedOwnLatestPost("self", 1, undefined);
    expect((await loadCachedOwnLatestPost("self"))?.postId).toBe(2);
    await patchCachedOwnLatestPost("self", 2, undefined);
    expect(await loadCachedOwnLatestPost("self")).toBeUndefined();
});

test("clears the preview when the refreshed profile has no posts", async () => {
    await cacheOwnLatestPost("self", post);
    await cacheOwnLatestPost("self", undefined);
    expect(await loadCachedOwnLatestPost("self")).toBeUndefined();
});

test("a cache failure does not fail the post operation", async () => {
    vi.mocked(setKV).mockRejectedValue(new Error("Storage unavailable"));
    await expect(cacheOwnLatestPost("self", post)).resolves.toBeUndefined();
    vi.mocked(getKV).mockRejectedValue(new Error("Storage unavailable"));
    await expect(loadCachedOwnLatestPost("self")).resolves.toBeUndefined();
});
