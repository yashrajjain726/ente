import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
    scheduleSlideshowAdvance,
    slideshowFiles,
    slideshowIndex,
} from "../src/components/Collections/album-slideshow";

const photo = (id: number, fileType: FileType = FileType.image) =>
    ({ id, metadata: { fileType } }) as EnteFile;

afterEach(() => {
    vi.useRealTimers();
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

describe("playback timeout", () => {
    const ready = { enabled: true, ready: true, count: 2 };
    test("advances once after five seconds", () => {
        vi.useFakeTimers();
        const advance = vi.fn();
        scheduleSlideshowAdvance(ready, advance);
        vi.advanceTimersByTime(4999);
        expect(advance).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(advance).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60_000);
        expect(advance).toHaveBeenCalledTimes(1);
    });

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
        scheduleSlideshowAdvance(ready, advance);
        vi.advanceTimersByTime(4999);
        expect(advance).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(advance).toHaveBeenCalledTimes(1);
    });

    test("cancels on pause, hidden document, navigation, and close", () => {
        vi.useFakeTimers();
        const advance = vi.fn();
        const cancel = scheduleSlideshowAdvance(ready, advance);
        vi.advanceTimersByTime(4000);
        cancel();
        scheduleSlideshowAdvance({ ...ready, enabled: false }, advance);
        vi.advanceTimersByTime(600_000);
        expect(advance).not.toHaveBeenCalled();
        const cancelResumed = scheduleSlideshowAdvance(ready, advance);
        vi.advanceTimersByTime(4999);
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
