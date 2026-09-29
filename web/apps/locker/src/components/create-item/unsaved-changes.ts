import type { LockerUploadCandidate } from "@/types";
import { uploadQueueItemKey } from "./file-upload-helpers";

// Compare drafts without treating absent optional fields or ordering as edits.
export function hasUnsavedItemChanges(
    data: Record<string, string>,
    initialData: Record<string, string>,
    collectionIDs: number[],
    initialCollectionIDs: number[],
    collectionName: string,
): boolean {
    const fields = new Set([...Object.keys(data), ...Object.keys(initialData)]);
    const collections = new Set(collectionIDs);
    const initialCollections = new Set(initialCollectionIDs);

    const hasCollectionDraft = collectionName !== "";
    const hasFieldChanges = [...fields].some((field) => {
        const currentValue = data[field] ?? "";
        const initialValue = initialData[field] ?? "";
        return currentValue !== initialValue;
    });
    const hasCollectionChanges =
        collections.size !== initialCollections.size ||
        [...collections].some((id) => !initialCollections.has(id));

    return hasCollectionDraft || hasFieldChanges || hasCollectionChanges;
}

export function hasPendingUploads(
    items: LockerUploadCandidate[],
    completedFileKeys: Set<string>,
): boolean {
    return items.some(
        (item) => !completedFileKeys.has(uploadQueueItemKey(item)),
    );
}
