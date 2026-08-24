import { expect, test, vi } from "vitest";

const { free, getInfo } = vi.hoisted(() => ({
    free: vi.fn(),
    getInfo: vi.fn(() =>
        Promise.resolve({
            contacts: [
                {
                    user: { id: 101n, email: "owner@test.test" },
                    emergencyContact: { id: 202n, email: "trusted@test.test" },
                    state: "ACCEPTED",
                    recoveryNoticeInDays: 14n,
                },
            ],
            recoverSessions: [
                {
                    id: "session_1",
                    user: { id: 101n, email: "owner@test.test" },
                    emergencyContact: { id: 202n, email: "trusted@test.test" },
                    status: "WAITING",
                    waitTill: 3_600_000_000n,
                    createdAt: 1_700_000_000_000_000n,
                },
            ],
            othersEmergencyContact: [],
            othersRecoverySession: [],
        }),
    ),
}));

vi.mock("ente-accounts/services/accounts-db", () => ({
    savedKeyAttributes: vi.fn(),
}));
vi.mock("ente-accounts/services/recovery-key", () => ({
    getUserRecoveryKey: vi.fn(),
}));
vi.mock("ente-accounts/services/session-storage", () => ({
    masterKeyFromSession: () => "master-key",
}));
vi.mock("ente-base/app", () => ({
    clientPackageName: "io.ente.test",
    desktopAppVersion: undefined,
    isDesktop: false,
}));
vi.mock("ente-base/origins", () => ({
    apiOrigin: () => "https://api.example",
}));
vi.mock("ente-base/token", () => ({ savedAuthToken: () => "auth-token" }));
vi.mock("ente-legacy-wasm/authenticated", () => ({
    openLegacy: () => Promise.resolve({ free, getInfo }),
}));

test("normalizes legacy numeric fields at the wasm boundary", async () => {
    const { legacyGetInfo } = await import("./service");

    const info = await legacyGetInfo();

    expect(info.contacts[0]?.user.id).toBe(101);
    expect(info.contacts[0]?.emergencyContact.id).toBe(202);
    expect(info.contacts[0]?.recoveryNoticeInDays).toBe(14);
    expect(info.recoverSessions[0]?.waitTill).toBe(3_600_000_000);
    expect(info.recoverSessions[0]?.createdAt).toBe(1_700_000_000_000_000);
    expect(free).toHaveBeenCalledOnce();
});
