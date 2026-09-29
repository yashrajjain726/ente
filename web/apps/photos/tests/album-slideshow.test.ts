import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
    holdSlideshowWakeLock,
    readSlideshowSettings,
    requestSlideshowFullscreen,
    saveSlideshowSettings,
    scheduleSlideshowAdvance,
    slideshowDurations,
    slideshowFiles,
    slideshowIndex,
} from "../src/components/Collections/album-slideshow";

const photo = (id: number, fileType: FileType = FileType.image) =>
    ({ id, metadata: { fileType } }) as EnteFile;

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test("uses only unique images and Live Photo stills, preserving album order", () => {
    const files = [
        photo(3),
        photo(2, FileType.video),
        photo(1, FileType.livePhoto),
        photo(3),
    ];
    expect(slideshowFiles(files)).toEqual([files[0], files[2]]);
    expect(files).toHaveLength(4);
    expect(slideshowFiles([])).toEqual([]);
    expect(slideshowFiles([photo(2, FileType.video)])).toEqual([]);
});

test("navigation loops in both directions and handles empty and single-photo albums", () => {
    expect(slideshowIndex(2, 1, 3)).toBe(0);
    expect(slideshowIndex(0, -1, 3)).toBe(2);
    expect(slideshowIndex(0, 1, 1)).toBe(0);
    expect(slideshowIndex(0, -1, 0)).toBe(0);
});

describe("preferences", () => {
    const defaults = { durationSeconds: 5 };
    test.each([
        null,
        "broken JSON",
        "null",
        "[]",
        "12",
        '{"durationSeconds":-1,"shuffle":"true","blurred":0}',
    ])("uses defaults for invalid or missing storage: %s", (saved) => {
        vi.stubGlobal("localStorage", { getItem: () => saved });
        expect(readSlideshowSettings()).toEqual(defaults);
    });

    test("round-trips every duration and ignores removed preferences", () => {
        const entries = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => entries.set(key, value),
        });
        for (const durationSeconds of slideshowDurations) {
            const settings = { durationSeconds };
            saveSlideshowSettings(settings);
            expect(readSlideshowSettings()).toEqual(settings);
        }
        entries.set("albumSlideshow", '{"durationSeconds":7,"shuffle":true}');
        expect(readSlideshowSettings()).toEqual(defaults);
        entries.set(
            "albumSlideshow",
            '{"durationSeconds":30,"shuffle":true,"blurred":false}',
        );
        expect(readSlideshowSettings()).toEqual({ durationSeconds: 30 });
    });

    test("continues when storage access throws", () => {
        const unavailable = () => {
            throw new Error("Storage denied");
        };
        vi.stubGlobal("localStorage", {
            getItem: unavailable,
            setItem: unavailable,
        });
        expect(readSlideshowSettings()).toEqual(defaults);
        expect(() => saveSlideshowSettings(defaults)).not.toThrow();
    });
});

describe("playback timeout", () => {
    const ready = { enabled: true, ready: true, durationSeconds: 5, count: 2 };
    test.each(slideshowDurations)(
        "advances once after %i seconds",
        (durationSeconds) => {
            vi.useFakeTimers();
            const advance = vi.fn();
            scheduleSlideshowAdvance({ ...ready, durationSeconds }, advance);
            vi.advanceTimersByTime(durationSeconds * 1000 - 1);
            expect(advance).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(advance).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(600_000);
            expect(advance).toHaveBeenCalledTimes(1);
        },
    );

    test("skips undisplayable media after ten seconds, or replaces that timeout once ready", () => {
        vi.useFakeTimers();
        const advance = vi.fn();
        const cancel = scheduleSlideshowAdvance(
            { ...ready, ready: false },
            advance,
        );
        vi.advanceTimersByTime(9999);
        expect(advance).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(advance).toHaveBeenCalledTimes(1);
        cancel();
        advance.mockClear();
        const cancelLoading = scheduleSlideshowAdvance(
            { ...ready, ready: false },
            advance,
        );
        vi.advanceTimersByTime(2000);
        cancelLoading();
        scheduleSlideshowAdvance({ ...ready, durationSeconds: 60 }, advance);
        vi.advanceTimersByTime(59_999);
        expect(advance).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(advance).toHaveBeenCalledTimes(1);
    });

    test("cancels on suspension, navigation, settings changes, and close", () => {
        vi.useFakeTimers();
        const advance = vi.fn();
        const cancel = scheduleSlideshowAdvance(ready, advance);
        vi.advanceTimersByTime(4000);
        cancel();
        scheduleSlideshowAdvance({ ...ready, enabled: false }, advance);
        vi.advanceTimersByTime(600_000);
        expect(advance).not.toHaveBeenCalled();
        const cancelResumed = scheduleSlideshowAdvance(
            { ...ready, durationSeconds: 10 },
            advance,
        );
        vi.advanceTimersByTime(9999);
        expect(advance).not.toHaveBeenCalled();
        cancelResumed();
        expect(vi.getTimerCount()).toBe(0);
    });

    test.each([0, 1])("does not schedule for %i photos", (count) => {
        vi.useFakeTimers();
        scheduleSlideshowAdvance({ ...ready, count }, vi.fn());
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("browser resources", () => {
    test("releases a wake lock acquired after playback has stopped", async () => {
        let resolve!: (lock: WakeLockSentinel) => void;
        const request = vi.fn(
            () =>
                new Promise<WakeLockSentinel>((done) => {
                    resolve = done;
                }),
        );
        vi.stubGlobal("navigator", { wakeLock: { request } });
        const release = vi.fn().mockResolvedValue(undefined);
        const cancel = holdSlideshowWakeLock();
        cancel();
        resolve({ release } as unknown as WakeLockSentinel);
        await Promise.resolve();
        expect(release).toHaveBeenCalledOnce();
    });

    test("releases and reacquires wake locks, tolerating rejection or missing support", async () => {
        const release = vi.fn().mockResolvedValue(undefined);
        const request = vi.fn().mockResolvedValue({ release });
        vi.stubGlobal("navigator", { wakeLock: { request } });
        const cancel = holdSlideshowWakeLock();
        await Promise.resolve();
        cancel();
        expect(release).toHaveBeenCalledOnce();
        const cancelAgain = holdSlideshowWakeLock();
        await Promise.resolve();
        expect(request).toHaveBeenCalledTimes(2);
        cancelAgain();
        request.mockRejectedValueOnce(new Error("Denied"));
        holdSlideshowWakeLock()();
        await Promise.resolve();
        vi.stubGlobal("navigator", {});
        expect(() => holdSlideshowWakeLock()()).not.toThrow();
    });

    function fullscreenDocument() {
        const doc = Object.assign(new EventTarget(), {
            fullscreenElement: null as object | null,
            documentElement: {
                requestFullscreen: vi.fn().mockResolvedValue(undefined),
            },
            exitFullscreen: vi.fn().mockResolvedValue(undefined),
        });
        vi.stubGlobal("document", doc);
        return doc;
    }

    test("closes on fullscreen exit and removes its listener on cleanup", async () => {
        const doc = fullscreenDocument();
        const onExit = vi.fn();
        const restore = requestSlideshowFullscreen(onExit);
        expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
        await Promise.resolve();
        doc.fullscreenElement = doc.documentElement;
        doc.dispatchEvent(new Event("fullscreenchange"));
        doc.fullscreenElement = null;
        doc.dispatchEvent(new Event("fullscreenchange"));
        expect(onExit).toHaveBeenCalledOnce();
        restore();
        doc.dispatchEvent(new Event("fullscreenchange"));
        expect(onExit).toHaveBeenCalledOnce();
    });

    test("restores only fullscreen owned by this slideshow, including late entry", async () => {
        const doc = fullscreenDocument();
        doc.fullscreenElement = {};
        requestSlideshowFullscreen(vi.fn())();
        expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
        expect(doc.exitFullscreen).not.toHaveBeenCalled();
        doc.fullscreenElement = null;
        const restore = requestSlideshowFullscreen(vi.fn());
        restore();
        doc.fullscreenElement = doc.documentElement;
        await Promise.resolve();
        expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    });

    test("fullscreen rejection leaves playback available and is cleaned up", async () => {
        const doc = fullscreenDocument();
        doc.documentElement.requestFullscreen.mockRejectedValueOnce(
            new Error("Denied"),
        );
        const onExit = vi.fn();
        const restore = requestSlideshowFullscreen(onExit);
        await Promise.resolve();
        await Promise.resolve();
        expect(onExit).not.toHaveBeenCalled();
        restore();
        expect(doc.exitFullscreen).not.toHaveBeenCalled();
    });
});
