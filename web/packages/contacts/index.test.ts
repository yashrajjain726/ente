import { beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
});

interface SetupOptions {
    diff?: object[];
    getProfilePictureError?: Error;
    getProfilePictureBytes?: Uint8Array;
    rootKeySource?: "cache" | "unresolved";
    wrappedRootContactKey?: { encryptedKey: string; header: string };
    currentWrappedRootContactKey?: { encryptedKey: string; header: string };
}

const setupContactsModule = async (options: SetupOptions = {}) => {
    const kv = new Map<string, unknown>();
    const setKV = vi.fn((key: string, value: unknown) => {
        kv.set(key, JSON.parse(JSON.stringify(value)));
    });
    const getKV = vi.fn((key: string) => kv.get(key));
    const getKVN = vi.fn((key: string) => {
        const value = kv.get(key);
        return typeof value === "number" ? value : undefined;
    });

    const savedAuthToken = vi.fn((): string | undefined => "auth-token-secret");
    const apiOrigin = vi.fn(() => "https://api.example");
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const updateAuthToken = vi.fn();
    let isRootKeyResolved = options.rootKeySource !== "unresolved";
    const currentWrappedRootContactKey = vi.fn(() =>
        isRootKeyResolved
            ? (options.currentWrappedRootContactKey ??
              options.wrappedRootContactKey ?? {
                  encryptedKey: "wrapped-root-key",
                  header: "wrapped-header",
              })
            : undefined,
    );
    const diff = options.diff ?? [
        {
            id: "ct_1",
            contactUserId: 101,
            email: "set@test.test",
            name: "Set",
            profilePictureAttachmentID: "ua_1",
            isDeleted: false,
            updatedAt: 1,
        },
    ];

    const getDiff = vi
        .fn()
        .mockImplementationOnce(() => {
            if (diff.length > 0) isRootKeyResolved = true;
            return Promise.resolve(diff);
        })
        .mockResolvedValueOnce([]);
    const getProfilePicture = vi.fn(() => {
        if (options.getProfilePictureBytes) {
            return Promise.resolve(options.getProfilePictureBytes);
        }
        return Promise.reject(
            options.getProfilePictureError ?? new Error("boom"),
        );
    });
    vi.doMock("ente-base/kv", () => ({ getKV, getKVN, setKV }));
    vi.doMock("ente-base/token", () => ({ savedAuthToken }));
    vi.doMock("ente-base/origins", () => ({ apiOrigin }));
    vi.doMock("ente-base/log", () => ({
        default: { info, warn, error },
        logToDisk: vi.fn(),
    }));
    vi.doMock("ente-accounts/services/session-storage", () => ({
        masterKeyFromSession: vi.fn(() => "MASTER_KEY"),
    }));
    vi.doMock("ente-accounts/services/user", () => ({
        ensureLocalUser: vi.fn(() => ({ id: 101 })),
    }));
    vi.doMock("ente-base/app", () => ({
        appName: "photos",
        clientPackageName: "io.ente.photos.web",
        desktopAppVersion: undefined,
        isDesktop: false,
    }));
    const contacts = await import("./index");
    const openContacts = () =>
        Promise.resolve({
            updateAuthToken,
            currentWrappedRootContactKey,
            getDiff,
            getProfilePicture,
        });

    return {
        contacts,
        openContacts,
        setKV,
        savedAuthToken,
        updateAuthToken,
        getDiff,
        getProfilePicture,
        info,
    };
};

describe("ensureContactsReady", () => {
    test("does not persist auth token or master key in contacts kv", async () => {
        const { contacts, openContacts, setKV } = await setupContactsModule();

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "MASTER_KEY_SHOULD_NOT_PERSIST" },
            openContacts,
        );

        const persisted = setKV.mock.calls
            .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
            .join("\n");

        expect(persisted).toContain("contacts/");
        expect(persisted).toContain("wrapped-root-key");
        expect(persisted).toContain("Set");
        expect(persisted).not.toContain("MASTER_KEY_SHOULD_NOT_PERSIST");
        expect(persisted).not.toContain("auth-token-secret");

        const resolved = contacts.resolveContactDisplay({ userID: 101 });
        expect(resolved.profilePictureAttachmentID).toBe("ua_1");
    });

    test("does not persist an unresolved wrapped root contact key", async () => {
        const { contacts, openContacts, setKV } = await setupContactsModule({
            rootKeySource: "unresolved",
            diff: [],
        });

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "MASTER_KEY_SHOULD_NOT_PERSIST" },
            openContacts,
        );

        const persisted = setKV.mock.calls
            .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
            .join("\n");

        expect(persisted).not.toContain("wrapped-root-key");
    });

    test("persists a resolved wrapped root contact key after non-empty diff", async () => {
        const { contacts, openContacts, setKV } = await setupContactsModule({
            rootKeySource: "unresolved",
        });

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "MASTER_KEY_SHOULD_NOT_PERSIST" },
            openContacts,
        );

        const persisted = setKV.mock.calls
            .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
            .join("\n");

        expect(persisted).toContain("wrapped-root-key");
    });
});

describe("profile picture loading", () => {
    test("negative-caches failed profile picture fetches and logs at info", async () => {
        const { contacts, getProfilePicture, info, openContacts } =
            await setupContactsModule({
                getProfilePictureError: new Error("network failure"),
            });

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "ignored" },
            openContacts,
        );

        await contacts.__testing.preloadResolvedContactAvatar({
            userID: 101,
            email: "set@test.test",
        });
        await contacts.__testing.preloadResolvedContactAvatar({
            userID: 101,
            email: "set@test.test",
        });

        expect(getProfilePicture).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0]?.[0]).toContain(
            "Failed to load contact profile picture for ct_1",
        );
    });

    test("uses the inferred image mime type for avatar blobs", async () => {
        const createObjectURL = vi
            .spyOn(URL, "createObjectURL")
            .mockReturnValue("blob:contact");
        const pngBytes = Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
            0x0d,
        ]);
        const { contacts, openContacts } = await setupContactsModule({
            getProfilePictureBytes: pngBytes,
        });

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "ignored" },
            openContacts,
        );
        await contacts.__testing.preloadResolvedContactAvatar({ userID: 101 });

        const blobArg = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
        expect(blobArg?.type).toBe("image/png");
    });
});

describe("retry after warm-up failure", () => {
    test("recovers from a transient failure with bounded background retry", async () => {
        vi.useFakeTimers();
        const { contacts, getDiff, openContacts } = await setupContactsModule();
        getDiff.mockReset();
        getDiff
            .mockRejectedValueOnce(new Error("transient"))
            .mockResolvedValueOnce([
                {
                    id: "ct_1",
                    contactUserId: 101,
                    email: "set@test.test",
                    name: "Set",
                    profilePictureAttachmentID: "ua_1",
                    isDeleted: false,
                    updatedAt: 1,
                },
            ])
            .mockResolvedValueOnce([]);

        const ready = contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "ignored" },
            openContacts,
        );
        await vi.advanceTimersByTimeAsync(10_001);
        await expect(ready).resolves.toBeUndefined();

        expect(getDiff).toHaveBeenCalledTimes(3);
    });

    test("stops after bounded background retries keep failing", async () => {
        vi.useFakeTimers();
        const { contacts, getDiff, openContacts } = await setupContactsModule();
        getDiff.mockReset();
        getDiff.mockRejectedValue(new Error("down"));

        const ready = expect(
            contacts.ensureContactsReady(
                { userID: 101, masterKeyB64: "ignored" },
                openContacts,
            ),
        ).rejects.toThrow("down");

        await vi.advanceTimersByTimeAsync(10_001);
        await vi.advanceTimersByTimeAsync(30_001);
        await vi.advanceTimersByTimeAsync(120_001);
        await ready;

        expect(getDiff).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(300_000);
        expect(getDiff).toHaveBeenCalledTimes(4);
    });

    test("stale retry does not update a newer generation context token", async () => {
        vi.useFakeTimers();
        const {
            contacts,
            savedAuthToken,
            updateAuthToken,
            getDiff,
            openContacts,
        } = await setupContactsModule();
        savedAuthToken
            .mockReturnValueOnce("old-token")
            .mockReturnValueOnce(undefined)
            .mockReturnValue("new-token");
        getDiff.mockReset();
        getDiff
            .mockRejectedValueOnce(new Error("transient"))
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const staleReady = contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "old-master-key" },
            openContacts,
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(getDiff).toHaveBeenCalledTimes(1);

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "clearing-master-key" },
            openContacts,
        );
        expect(getDiff).toHaveBeenCalledTimes(1);

        await contacts.ensureContactsReady(
            { userID: 101, masterKeyB64: "new-master-key" },
            openContacts,
        );
        expect(getDiff).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(10_001);
        await expect(staleReady).resolves.toBeUndefined();
        expect(updateAuthToken).not.toHaveBeenCalled();
        expect(getDiff).toHaveBeenCalledTimes(2);
    });
});
