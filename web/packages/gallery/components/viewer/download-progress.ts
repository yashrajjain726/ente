import type { FileDownloadProgress } from "ente-gallery/services/download-core";
import type { ItemData } from "./data-source-core";

export type DownloadProgressPhase =
    | "preparing"
    | "downloading"
    | "decrypting"
    | "failed";

export interface DownloadProgressState {
    phase: DownloadProgressPhase;
    pct: number | undefined;
    loaded?: number;
    total?: number;
}

export const downloadProgressState = (
    itemData: Pick<ItemData, "isContentLoading" | "fetchFailed">,
    entry: FileDownloadProgress | undefined,
    previous: DownloadProgressState | undefined,
): DownloadProgressState | undefined => {
    if (itemData.fetchFailed)
        return { phase: "failed", pct: previous?.pct ?? 0 };
    if (!itemData.isContentLoading) return undefined;

    if (entry) {
        const { loaded, total } = entry;
        if (total !== undefined && total > 0) {
            if (loaded >= total)
                return { phase: "decrypting", pct: 100, loaded, total };
            if (loaded > 0)
                return {
                    phase: "downloading",
                    pct: Math.min(99, Math.floor((loaded * 100) / total)),
                    loaded,
                    total,
                };
            return { phase: "preparing", pct: 0 };
        }
        if (total === undefined && loaded > 0)
            return { phase: "downloading", pct: undefined, loaded };
    } else if (
        previous?.phase == "downloading" ||
        previous?.phase == "decrypting"
    ) {
        return { phase: "decrypting", pct: 100 };
    }
    return { phase: "preparing", pct: 0 };
};
