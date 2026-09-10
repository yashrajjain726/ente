import { addFileToCollections } from "./collection-membership";
import { resolveCollectionIDsWithUncategorizedFallback } from "./collections";
import { getCollectionRecord } from "./locker-cache";
import {
    type LockerUploadProgress,
    uploadLockerFileWithDeps,
} from "./remote-uploads";
import { decryptCollectionKey } from "./sync/decrypt";
export {
    deleteCollectionKeepingFiles,
    updateItemCollections,
} from "./collection-membership";
export {
    fetchCollectionSharees,
    leaveCollection,
    shareCollection,
    unshareCollection,
} from "./collection-sharing";
export {
    createCollection,
    deleteCollection,
    renameCollection,
} from "./collections";

export { downloadLockerFile } from "./download";
export {
    deleteLockerFileShareLink,
    getOrCreateLockerFileShareLink,
} from "./file-links";
export { loadPersistedLockerState, syncLockerState } from "./sync/sync";

export {
    createInfoItem,
    setItemImportant,
    updateFileItem,
    updateInfoItem,
} from "./items";
export {
    emptyTrash,
    permanentlyDeleteFromTrash,
    restoreFromTrash,
    trashFiles,
} from "./trash";

export type { LockerUploadProgress } from "./remote-uploads";

export const uploadLockerFile = async (
    file: File,
    collectionIDs: number[],
    masterKey: string,
    onProgress?: (progress: LockerUploadProgress) => void,
): Promise<number> => {
    const targetCollectionIDs =
        await resolveCollectionIDsWithUncategorizedFallback(
            collectionIDs,
            masterKey,
        );
    return uploadLockerFileWithDeps(
        file,
        targetCollectionIDs,
        { getCollectionRecord, decryptCollectionKey, addFileToCollections },
        onProgress,
    );
};
