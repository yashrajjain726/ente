import type { FileDownloadProgress } from "ente-gallery/services/download-core";
import type { ItemData } from "./data-source-core";

export type DownloadProgressPhase =
    | "preparing"
    | "downloading"
    | "decrypting"
    | "failed";

export interface DownloadProgressState {
    phase: DownloadProgressPhase;
    precentage: number | undefined;
    loaded?: number;
    total?: number;
}

export const downloadProgressState = (
    itemData: Pick<ItemData, "isContentLoading" | "fetchFailed">,
    entry: FileDownloadProgress | undefined,
    previous: DownloadProgressState | undefined,
): DownloadProgressState | undefined => {
    if (itemData.fetchFailed)
        return { phase: "failed", precentage: previous?.precentage ?? 0 };
    if (!itemData.isContentLoading) return undefined;

    if (entry) {
        const { loaded, total } = entry;
        if (total !== undefined && total > 0) {
            if (loaded >= total)
                return { phase: "decrypting", precentage: 100, loaded, total };
            if (loaded > 0)
                return {
                    phase: "downloading",
                    precentage: Math.min(
                        99,
                        Math.floor((loaded * 100) / total),
                    ),
                    loaded,
                    total,
                };
            return { phase: "preparing", precentage: 0 };
        }
        if (total === undefined && loaded > 0)
            return { phase: "downloading", precentage: undefined, loaded };
    } else if (
        previous?.phase == "downloading" ||
        previous?.phase == "decrypting"
    ) {
        return { phase: previous.phase, precentage: previous.precentage };
    }
    return { phase: "preparing", precentage: 0 };
};
