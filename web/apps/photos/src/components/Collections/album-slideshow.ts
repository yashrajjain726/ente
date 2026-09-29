import { uniqueFilesByID } from "ente-gallery/utils/file";
import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";

export const slideshowFiles = (files: EnteFile[]) =>
    uniqueFilesByID(
        files.filter(
            ({ metadata: { fileType } }) =>
                fileType === FileType.image || fileType === FileType.livePhoto,
        ),
    );

export const slideshowIndex = (index: number, offset: number, count: number) =>
    count ? (index + offset + count) % count : 0;

// ponytail: fixed five-second playback; skip photos that cannot load in ten seconds.
export function scheduleSlideshowAdvance(
    {
        enabled,
        ready,
        count,
    }: { enabled: boolean; ready: boolean; count: number },
    advance: () => void,
) {
    const timer =
        enabled && count > 1
            ? setTimeout(advance, ready ? 5000 : 10_000)
            : undefined;
    return () => clearTimeout(timer);
}
