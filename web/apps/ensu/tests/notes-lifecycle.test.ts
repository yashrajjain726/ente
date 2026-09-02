import { describe, expect, test } from "vitest";
import { NotesLifecycleController } from "../src/services/notes-lifecycle";

describe("NotesLifecycleController", () => {
    test("coalesces active and blocked requests without losing force", () => {
        const controller = new NotesLifecycleController();

        expect(controller.requestIndex("a", false, false)).toBe("start");
        expect(controller.requestIndex("a", false, false)).toBe("queued");
        expect(controller.requestIndex("a", true, false)).toBe("queued");
        expect(controller.finishIndex("a").queuedForce).toBe(true);
        expect(controller.requestIndex("b", false, true)).toBe("queued");
        expect(controller.drainQueued(false)).toEqual([["b", false]]);
    });

    test("keeps removal separate from active and queued indexing", () => {
        const controller = new NotesLifecycleController();

        controller.requestIndex("a", false, false);
        expect(controller.beginRemoval("a")).toEqual({ kind: "wait" });
        expect(controller.finishIndex("a").clearedRemovalWait).toBe(true);

        controller.queueIndex("a", true);
        expect(controller.beginRemoval("a")).toEqual({
            kind: "start",
            queuedForce: true,
        });
        expect(controller.requestIndex("a", false, false)).toBe("ignored");
        controller.cancelRemoval("a");
        expect(controller.requestIndex("a", false, false)).toBe("start");
    });

    test("rejects stale refreshes after a mutation or newer request", () => {
        const controller = new NotesLifecycleController();
        const first = controller.beginRefresh();
        const firstMutation = controller.refreshMutationSnapshot();
        controller.markMutation();
        expect(controller.canApplyRefresh(first, firstMutation)).toBe(false);

        const secondMutation = controller.refreshMutationSnapshot();
        const second = controller.beginRefresh();
        expect(controller.isRefreshCurrent(first)).toBe(false);
        expect(controller.canApplyRefresh(second, secondMutation)).toBe(true);
    });

    test("resumes each pending collection once and stops work after disposal", () => {
        const controller = new NotesLifecycleController();
        expect(controller.markResumed("a")).toBe(true);
        expect(controller.markResumed("a")).toBe(false);
        controller.dispose();
        expect(controller.requestIndex("b", false, false)).toBe("ignored");
        expect(controller.drainQueued(false)).toEqual([]);
        controller.activate();
        expect(controller.requestIndex("b", false, false)).toBe("start");
    });
});
