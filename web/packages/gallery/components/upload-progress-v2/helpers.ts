import { formattedListJoin } from "ente-base/i18n";
import type { SkippedFile } from "ente-base/types/ipc";
import type { UploadPhase } from "ente-gallery/services/upload";
import { t } from "i18next";
import {
    finishedStatKinds,
    uploadCompletionCounts,
    uploadStatColors,
    type FinishedStatKind,
    type FinishedUploadType,
    type UploadStatKind,
} from "../uploadProgressStats";
import type { UploadProgressContextT } from "./context";

export const finishedTypeReasonKeys: Partial<
    Record<FinishedUploadType, string>
> = {
    uploadedWithStaticThumbnail: "thumbnail_generation_failed",
    alreadyUploaded: "upload_reason_already_uploaded",
    largerThanAvailableStorage: "upload_reason_insufficient_storage",
    tooLarge: "upload_reason_too_large",
    unsupported: "upload_reason_unsupported",
    zeroSize: "upload_reason_zero_size",
    blocked: "upload_reason_blocked",
    failed: "upload_reason_failed",
};

export const finishedTypeReasonHintKeys: Partial<
    Record<FinishedUploadType, string>
> = {
    uploadedWithStaticThumbnail: "upload_hint_static_thumbnail",
    blocked: "upload_hint_blocked",
};

export const skippedFileReasonKeys: Record<SkippedFile["type"], string> = {
    hiddenFile: "upload_reason_hidden_file",
    failedZip: "upload_reason_unreadable_zip",
};

export const statConfigs = [
    { kind: "inProgress", color: "#d9d9d9", labelKey: "in_progress" },
    ...finishedStatKinds.map((kind) => ({
        kind,
        color: uploadStatColors[kind],
        labelKey: kind,
    })),
] satisfies { kind: UploadStatKind; color: string; labelKey: string }[];

export const doneStatConfigs = statConfigs.slice(1) as {
    kind: FinishedStatKind;
    color: string;
    labelKey: FinishedStatKind;
}[];

export const statEmptyMessageKeys: Record<FinishedStatKind, string> = {
    completed: "no_completed_uploads_yet",
    skipped: "no_skipped_files_yet",
    failed: "no_failed_uploads_yet",
};

const uploadStatusTextKeys: Record<UploadPhase, string> = {
    preparing: "preparing",
    readingMetadata: "upload_reading_metadata_files",
    uploading: "uploading",
    cancelling: "upload_cancelling",
    done: "upload_complete",
};

export const uploadStatusText = (uploadPhase: UploadPhase) =>
    t(uploadStatusTextKeys[uploadPhase]);

export const uploadCountsText = ({
    uploadPhase,
    uploadCounter,
    finishedUploads,
    skippedFiles,
}: Pick<
    UploadProgressContextT,
    "uploadPhase" | "uploadCounter" | "finishedUploads" | "skippedFiles"
>) => {
    if (uploadPhase == "done") {
        const {
            completed: count,
            skipped,
            failed,
        } = uploadCompletionCounts(finishedUploads, skippedFiles);
        const notCount = skipped + failed;
        const items: string[] = [];
        if (count) items.push(t("upload_done", { count }));
        if (notCount) items.push(t("upload_skipped", { count: notCount }));
        return items.length
            ? formattedListJoin(items)
            : t("upload_done", { count });
    }
    return uploadCounter.total
        ? t("upload_items_progress", {
              finished: uploadCounter.finished,
              total: uploadCounter.total,
          })
        : uploadStatusText(uploadPhase);
};

/**
 *
 * @param value The upload percent which has decimal places
 * @returns The value with the decimal places rounded.
 */
export const normalizePercent = (value: number) =>
    Math.min(100, Math.max(0, Math.round(value || 0)));
