import { describe, expect, test } from "vitest";
import { NotesLifecycleController } from "../src/services/notes-lifecycle";

describe("NotesLifecycleController", () => {
    test("recovers cancelled indexing without duplicating or losing queued work", () => {
        const controller = new NotesLifecycleController();

        expect(controller.ensureIndex("notes", false)).toBe("start");
        expect(controller.indexActivity("notes")).toBe("starting");
        controller.queueIndex("notes", false);
        expect(controller.finishIndex("notes")).toEqual({
            clearedRemovalWait: false,
        });
        expect(controller.indexActivity("notes")).toBe("queued");
        expect(controller.ensureIndex("notes", false)).toBe("ignored");
        expect(controller.drainQueued(true)).toEqual([]);
        expect(controller.drainQueued(false)).toEqual([["notes", false]]);

        expect(controller.requestIndex("notes", false, false)).toBe("start");
        expect(controller.requestIndex("notes", true, false)).toBe("queued");
        controller.finishIndex("notes");
        expect(controller.drainQueued(false)).toEqual([["notes", true]]);

        expect(controller.requestIndex("notes", true, false)).toBe("start");
        controller.failIndex("notes");
        controller.finishIndex("notes");
        expect(controller.indexActivity("notes")).toBe("failed");
        expect(controller.ensureIndex("notes", false)).toBe("ignored");
        expect(controller.requestIndex("notes", true, false)).toBe("start");
    });
});
