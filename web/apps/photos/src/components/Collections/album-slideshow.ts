import { uniqueFilesByID } from "ente-gallery/utils/file";
import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";

export const slideshowDurations = [5, 10, 15, 30, 60, 300, 600];
const settingsKey = "albumSlideshow";

export interface SlideshowSettings {
    durationSeconds: number;
}

const defaultSettings: SlideshowSettings = { durationSeconds: 5 };

export function readSlideshowSettings(): SlideshowSettings {
    try {
        const value: unknown = JSON.parse(
            localStorage.getItem(settingsKey) ?? "null",
        );
        if (!value || typeof value !== "object") return { ...defaultSettings };
        const saved = value as Partial<SlideshowSettings>;
        return {
            durationSeconds: slideshowDurations.includes(saved.durationSeconds!)
                ? saved.durationSeconds!
                : defaultSettings.durationSeconds,
        };
    } catch {
        return { ...defaultSettings };
    }
}

export function saveSlideshowSettings(settings: SlideshowSettings) {
    try {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
        // Playback still works when browser storage is unavailable.
    }
}

export const slideshowFiles = (files: EnteFile[]) =>
    uniqueFilesByID(
        files.filter(
            ({ metadata: { fileType } }) =>
                fileType === FileType.image || fileType === FileType.livePhoto,
        ),
    );

export const slideshowIndex = (index: number, offset: number, count: number) =>
    count ? (index + offset + count) % count : 0;

// ponytail: one cancellable timeout; the component owns readiness and visibility.
export function scheduleSlideshowAdvance(
    {
        enabled,
        ready,
        durationSeconds,
        count,
    }: {
        enabled: boolean;
        ready: boolean;
        durationSeconds: number;
        count: number;
    },
    advance: () => void,
) {
    const timer =
        enabled && count > 1
            ? setTimeout(advance, ready ? durationSeconds * 1000 : 10_000)
            : undefined;
    return () => clearTimeout(timer);
}

export function holdSlideshowWakeLock() {
    let cancelled = false;
    let lock: WakeLockSentinel | undefined;
    if ("wakeLock" in navigator)
        void navigator.wakeLock
            .request("screen")
            .then((acquired) => {
                if (cancelled) void acquired.release().catch(() => undefined);
                else lock = acquired;
            })
            .catch(() => undefined);
    return () => {
        cancelled = true;
        void lock?.release().catch(() => undefined);
    };
}

// Called directly from the menu click so fullscreen retains user activation.
export function requestSlideshowFullscreen(onExit: () => void) {
    const element = document.documentElement;
    if (
        document.fullscreenElement ||
        typeof element.requestFullscreen !== "function"
    )
        return () => undefined;
    let cancelled = false;
    let entered = false;
    const changed = () => {
        if (document.fullscreenElement === element) entered = true;
        else if (entered) onExit();
    };
    const exit = () => {
        if (document.fullscreenElement === element)
            void document.exitFullscreen().catch(() => undefined);
    };
    document.addEventListener("fullscreenchange", changed);
    void element
        .requestFullscreen()
        .then(() => {
            if (cancelled) exit();
            else entered = true;
        })
        .catch(() => undefined);
    return () => {
        cancelled = true;
        document.removeEventListener("fullscreenchange", changed);
        if (entered) exit();
    };
}
