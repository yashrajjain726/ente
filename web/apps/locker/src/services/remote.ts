import type { LockerCollection, LockerItem, LockerItemType } from "@/types";
import { ensureLocalUser } from "ente-accounts/services/user";
import { authenticatedRequestHeaders, ensureOk } from "ente-base/http";
import log from "ente-base/log";
import { apiURL } from "ente-base/origins";
import {
    decryptBox,
    decryptMetadataJSON,
    encryptBlob,
    encryptBox,
    generateKey,
    openFileLinkSecret,
    prepareFileLink,
} from "ente-locker-wasm";
import { z } from "zod";
import { ensureAuthenticatedSession } from "./authenticated-session";
import {
    findCollectionByType,
    getCollectionIDsForFile,
    getCollectionRecord,
    getEncryptedFileRecord,
    updateCachedPubMagicMetadata,
} from "./remote-cache";
import {
    deleteCollectionKeepingFilesWithDeps,
    type EncryptedCollectionFileItem,
    updateItemCollectionsWithDeps,
} from "./remote-collection-mutations";
import {
    deleteCollection,
    ensureFavoritesCollection,
    ensureUncategorizedCollection,
} from "./remote-collections";
import {
    decryptCollectionKey,
    decryptFileKeyForRecord,
    downloadLockerFile,
    fetchLockerTrash,
    loadPersistedLockerState,
    syncLockerState,
} from "./remote-read";
import { RemoteIDResponseSchema } from "./remote-types";
import {
    type LockerUploadProgress,
    uploadLockerFileWithDeps,
} from "./remote-uploads";
export {
    fetchCollectionSharees,
    shareCollection,
    unshareCollection,
} from "./remote-collection-sharing";
export { createCollection, renameCollection } from "./remote-collections";
export { deleteCollection };

export { downloadLockerFile, loadPersistedLockerState, syncLockerState };

const RemoteFileShareLink = z.object({
    linkID: z.union([z.string(), z.number().transform(String)]),
    url: z.string(),
    ownerID: z.number(),
    fileID: z.number(),
    isDisabled: z.boolean().optional(),
    validTill: z.number().nullish(),
    deviceLimit: z.number().nullish(),
    passwordEnabled: z.boolean(),
    nonce: z.string().nullish(),
    memLimit: z.number().nullish(),
    opsLimit: z.number().nullish(),
    enableDownload: z.boolean(),
    createdAt: z.number(),
    encryptedFileKey: z.string().nullish(),
    encryptedFileKeyNonce: z.string().nullish(),
    kdfNonce: z.string().nullish(),
    kdfMemLimit: z.number().nullish(),
    kdfOpsLimit: z.number().nullish(),
    encryptedShareKey: z.string().nullish(),
});

interface LockerFileShareLink {
    linkID: string;
    url: string;
    fileID?: number;
    validTill?: number | null;
    enableDownload?: boolean;
    passwordEnabled?: boolean;
}

const infoItemTitle = (
    infoType: LockerItemType,
    infoData: Record<string, unknown>,
) => {
    const namedTitle =
        (infoData.title as string | undefined)?.trim() ||
        (infoData.name as string | undefined)?.trim();
    if (namedTitle) {
        return namedTitle;
    }

    switch (infoType) {
        case "note":
            return "Note";
        case "physicalRecord":
            return "Location";
        case "accountCredential":
            return "Secret";
        case "emergencyContact":
            return "Emergency Contact";
        case "file":
            return "File";
    }
};

const resolveCollectionIDsWithUncategorizedFallback = async (
    collectionIDs: number[],
    masterKey: string,
) =>
    collectionIDs.length > 0
        ? Array.from(new Set(collectionIDs))
        : [(await ensureUncategorizedCollection(masterKey)).id];

export const getOrCreateLockerFileShareLink = async (
    fileID: number,
): Promise<LockerFileShareLink> => {
    const fileRecord = getEncryptedFileRecord(fileID);
    if (!fileRecord) {
        throw new Error(`File ${fileID} not found in cache`);
    }

    const fileKey = await decryptFileKeyForRecord(fileRecord);
    const session = await ensureAuthenticatedSession();
    const payload = await prepareFileLink(session, fileKey);

    const res = await fetch(await apiURL("/files/share-url"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileID, app: "locker", ...payload.metadata }),
    });
    ensureOk(res);

    const link = RemoteFileShareLink.parse(await res.json());
    const secret = link.encryptedShareKey
        ? await openFileLinkSecret(session, link.encryptedShareKey)
        : payload.secret;

    return {
        linkID: link.linkID,
        url: `${link.url}#${secret}`,
        fileID: link.fileID,
        validTill: link.validTill,
        enableDownload: link.enableDownload,
        passwordEnabled: link.passwordEnabled,
    };
};

export const deleteLockerFileShareLink = async (
    fileID: number,
    linkID?: string,
): Promise<void> => {
    const candidateIDs = [linkID, String(fileID)].filter(
        (candidate, index, values): candidate is string =>
            !!candidate && values.indexOf(candidate) === index,
    );

    let lastError: Error | undefined;
    for (const candidateID of candidateIDs) {
        const res = await fetch(
            await apiURL(`/files/share-url/${candidateID}`),
            { method: "DELETE", headers: await authenticatedRequestHeaders() },
        );
        if (res.ok) {
            return;
        }
        lastError = new Error(
            `Failed to delete link ${candidateID}: ${res.status} ${res.statusText}`,
        );
        if (candidateID !== String(fileID)) {
            continue;
        }
    }

    throw lastError ?? new Error("Failed to delete file share link");
};

export const createInfoItem = async (
    collectionIDs: number[],
    infoType: LockerItemType,
    infoData: Record<string, unknown>,
    masterKey: string,
): Promise<void> => {
    const [collectionID, ...additionalCollectionIDs] =
        await resolveCollectionIDsWithUncategorizedFallback(
            collectionIDs,
            masterKey,
        );
    if (collectionID === undefined) {
        throw new Error("No collection selected");
    }
    const collectionRecord = getCollectionRecord(collectionID);
    if (!collectionRecord)
        throw new Error(`Collection ${collectionID} not in cache`);

    const collectionKey = await decryptCollectionKey(collectionRecord);

    const fileKey = await generateKey();

    const encryptedFileKey = await encryptBox(fileKey, collectionKey);

    // Locker timestamps are epoch milliseconds, unlike photos which uses
    // microseconds.
    const now = Date.now();
    const title = infoItemTitle(infoType, infoData);
    const metadata = {
        title,
        creationTime: now,
        modificationTime: now,
        fileType: 4, // FileType.info in the mobile client's enum
    };
    const metadataJSON = JSON.stringify(metadata);
    const encryptedMetadata = await encryptBlob(
        new TextEncoder().encode(metadataJSON),
        fileKey,
    );

    const pubMagicMetadata = {
        info: { type: infoType, data: infoData },
        noThumb: true,
    };
    const pubMMJSON = JSON.stringify(pubMagicMetadata);
    const encryptedPubMM = await encryptBlob(
        new TextEncoder().encode(pubMMJSON),
        fileKey,
    );

    const res = await fetch(await apiURL("/files/meta"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            collectionID,
            encryptedKey: encryptedFileKey.encryptedData,
            keyDecryptionNonce: encryptedFileKey.nonce,
            metadata: {
                encryptedData: encryptedMetadata.encryptedData,
                decryptionHeader: encryptedMetadata.decryptionHeader,
            },
            pubMagicMetadata: {
                version: 1,
                count: Object.keys(pubMagicMetadata).length,
                data: encryptedPubMM.encryptedData,
                header: encryptedPubMM.decryptionHeader,
            },
        }),
    });
    ensureOk(res);

    const created = RemoteIDResponseSchema.parse(await res.json());
    if (additionalCollectionIDs.length > 0) {
        await addFileToCollections(
            created.id,
            fileKey,
            additionalCollectionIDs,
        );
    }
};

export const updateInfoItem = async (
    fileID: number,
    infoType: LockerItemType,
    infoData: Record<string, unknown>,
): Promise<void> =>
    updateItemMetadata(fileID, {
        info: { type: infoType, data: infoData },
        editedName: infoItemTitle(infoType, infoData),
    });

export const updateFileItem = async (
    fileID: number,
    title: string,
): Promise<void> => updateItemMetadata(fileID, { editedName: title.trim() });

const updateItemMetadata = async (
    fileID: number,
    updates: Record<string, unknown>,
): Promise<void> => {
    const fileRecord = getEncryptedFileRecord(fileID);
    if (!fileRecord) throw new Error(`File ${fileID} not in cache`);

    const collectionRecord = getCollectionRecord(fileRecord.collectionID);
    if (!collectionRecord)
        throw new Error(`Collection ${fileRecord.collectionID} not in cache`);

    const collectionKey = await decryptCollectionKey(collectionRecord);
    const fileKey = await decryptBox(
        {
            encryptedData: fileRecord.encryptedKey,
            nonce: fileRecord.keyDecryptionNonce,
        },
        collectionKey,
    );

    const existingPubMagicMetadata = fileRecord.pubMagicMetadata
        ? ((await decryptMetadataJSON(
              {
                  encryptedData: fileRecord.pubMagicMetadata.data,
                  decryptionHeader: fileRecord.pubMagicMetadata.header,
              },
              fileKey,
          )) as Record<string, unknown>)
        : {};

    const pubMagicMetadata = {
        ...existingPubMagicMetadata,
        ...updates,
        noThumb: true,
        editedTime: Date.now(),
    };
    const pubMMJSON = JSON.stringify(pubMagicMetadata);
    const encryptedPubMM = await encryptBlob(
        new TextEncoder().encode(pubMMJSON),
        fileKey,
    );
    const version = fileRecord.pubMagicMetadata?.version ?? 1;

    const res = await fetch(await apiURL("/files/public-magic-metadata"), {
        method: "PUT",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            metadataList: [
                {
                    id: fileID,
                    magicMetadata: {
                        version,
                        count: Object.keys(pubMagicMetadata).length,
                        data: encryptedPubMM.encryptedData,
                        header: encryptedPubMM.decryptionHeader,
                    },
                },
            ],
        }),
    });
    ensureOk(res);

    updateCachedPubMagicMetadata(fileID, {
        version: version + 1,
        data: encryptedPubMM.encryptedData,
        header: encryptedPubMM.decryptionHeader,
    });
};

export const updateItemCollections = async (
    fileID: number,
    collectionIDs: number[],
    masterKey: string,
): Promise<void> => {
    await updateItemCollectionsWithDeps(fileID, collectionIDs, {
        currentUserID: ensureLocalUser().id,
        masterKey,
        deps: createCollectionMutationDeps(),
    });
};

export const trashFiles = async (
    fileIDs: number[],
    collectionID: number,
): Promise<void> => {
    const res = await fetch(await apiURL("/files/trash"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            items: fileIDs.map((fileID) => ({ fileID, collectionID })),
        }),
    });
    ensureOk(res);
};

export const permanentlyDeleteFromTrash = async (
    fileIDs: number[],
): Promise<void> => {
    const res = await fetch(await apiURL("/trash/delete"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileIDs }),
    });
    ensureOk(res);
};

export const emptyTrash = async (lastUpdatedAt: number): Promise<void> => {
    const res = await fetch(await apiURL("/trash/empty"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ lastUpdatedAt }),
    });
    ensureOk(res);
};

const addFileToCollections = async (
    fileID: number,
    fileKey: string,
    targetCollectionIDs: number[],
): Promise<void> => {
    for (const targetCollectionID of targetCollectionIDs) {
        const collectionRecord = getCollectionRecord(targetCollectionID);
        if (!collectionRecord) {
            throw new Error(`Collection ${targetCollectionID} not in cache`);
        }

        const collectionKey = await decryptCollectionKey(collectionRecord);
        const encryptedFileKey = await encryptBox(fileKey, collectionKey);

        const res = await fetch(await apiURL("/collections/add-files"), {
            method: "POST",
            headers: {
                ...(await authenticatedRequestHeaders()),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                collectionID: targetCollectionID,
                files: [
                    {
                        id: fileID,
                        encryptedKey: encryptedFileKey.encryptedData,
                        keyDecryptionNonce: encryptedFileKey.nonce,
                    },
                ],
            }),
        });
        ensureOk(res);
    }
};

const COLLECTION_MUTATION_BATCH_SIZE = 100;

const batchValues = <T>(
    values: T[],
    batchSize = COLLECTION_MUTATION_BATCH_SIZE,
) => {
    const batches: T[][] = [];
    for (let i = 0; i < values.length; i += batchSize) {
        batches.push(values.slice(i, i + batchSize));
    }
    return batches;
};

const decryptFileKeyForCollection = async (
    fileID: number,
    collectionID: number,
): Promise<string> => {
    const fileRecord = getEncryptedFileRecord(fileID, collectionID);
    if (!fileRecord) {
        throw new Error(
            `File ${fileID} not in cache for collection ${collectionID}`,
        );
    }

    const collectionRecord = getCollectionRecord(collectionID);
    if (!collectionRecord) {
        throw new Error(`Collection ${collectionID} not in cache`);
    }

    const collectionKey = await decryptCollectionKey(collectionRecord);
    return await decryptBox(
        {
            encryptedData: fileRecord.encryptedKey,
            nonce: fileRecord.keyDecryptionNonce,
        },
        collectionKey,
    );
};

const buildEncryptedFileMoveItem = async (
    fileID: number,
    fromCollectionID: number,
    toCollectionID: number,
): Promise<EncryptedCollectionFileItem> => {
    const fileKey = await decryptFileKeyForCollection(fileID, fromCollectionID);
    const targetCollectionRecord = getCollectionRecord(toCollectionID);
    if (!targetCollectionRecord) {
        throw new Error(`Collection ${toCollectionID} not in cache`);
    }
    const targetCollectionKey = await decryptCollectionKey(
        targetCollectionRecord,
    );
    const encryptedFileKey = await encryptBox(fileKey, targetCollectionKey);

    return {
        id: fileID,
        encryptedKey: encryptedFileKey.encryptedData,
        keyDecryptionNonce: encryptedFileKey.nonce,
    };
};

const removeFilesFromCollection = async (
    collectionID: number,
    fileIDs: number[],
): Promise<void> => {
    if (fileIDs.length === 0) {
        return;
    }

    for (const fileIDBatch of batchValues(fileIDs)) {
        const res = await fetch(await apiURL("/collections/v3/remove-files"), {
            method: "POST",
            headers: {
                ...(await authenticatedRequestHeaders()),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ collectionID, fileIDs: fileIDBatch }),
        });
        ensureOk(res);
    }
};

const moveFilesBetweenCollections = async (
    fromCollectionID: number,
    toCollectionID: number,
    files: EncryptedCollectionFileItem[],
): Promise<void> => {
    if (files.length === 0) {
        return;
    }

    for (const fileBatch of batchValues(files)) {
        const res = await fetch(await apiURL("/collections/move-files"), {
            method: "POST",
            headers: {
                ...(await authenticatedRequestHeaders()),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                fromCollectionID,
                toCollectionID,
                files: fileBatch,
            }),
        });
        ensureOk(res);
    }
};

const createCollectionMutationDeps = () => ({
    getCollectionIDsForFile,
    getCollectionRecord,
    ensureUncategorizedCollection,
    decryptFileKeyForCollection,
    buildEncryptedFileMoveItem,
    removeFilesFromCollection,
    moveFilesBetweenCollections,
    addFileToCollections,
});

export const restoreFromTrash = async (
    items: Pick<LockerItem, "id" | "collectionID">[],
    targetCollectionID: number,
): Promise<void> => {
    const collectionRecord = getCollectionRecord(targetCollectionID);
    if (!collectionRecord)
        throw new Error(`Collection ${targetCollectionID} not in cache`);

    const collectionKey = await decryptCollectionKey(collectionRecord);

    const buildRestorePayload = async (
        candidateItems: Pick<LockerItem, "id" | "collectionID">[],
    ) => {
        const files: {
            id: number;
            encryptedKey: string;
            keyDecryptionNonce: string;
        }[] = [];
        const skippedFileIDs: number[] = [];

        for (const item of candidateItems) {
            const fileRecord = getEncryptedFileRecord(
                item.id,
                item.collectionID,
            );
            if (!fileRecord) {
                skippedFileIDs.push(item.id);
                continue;
            }

            const origCollectionRecord = getCollectionRecord(
                fileRecord.collectionID,
            );
            if (!origCollectionRecord) {
                skippedFileIDs.push(item.id);
                continue;
            }

            const origCollectionKey =
                await decryptCollectionKey(origCollectionRecord);
            const fileKey = await decryptBox(
                {
                    encryptedData: fileRecord.encryptedKey,
                    nonce: fileRecord.keyDecryptionNonce,
                },
                origCollectionKey,
            );

            const encryptedFileKey = await encryptBox(fileKey, collectionKey);
            files.push({
                id: item.id,
                encryptedKey: encryptedFileKey.encryptedData,
                keyDecryptionNonce: encryptedFileKey.nonce,
            });
        }

        return { files, skippedFileIDs };
    };

    let { files, skippedFileIDs } = await buildRestorePayload(items);
    if (files.length === 0 && skippedFileIDs.length > 0) {
        await fetchLockerTrash();
        ({ files, skippedFileIDs } = await buildRestorePayload(items));
    }

    if (skippedFileIDs.length > 0) {
        log.warn(
            `Skipping ${skippedFileIDs.length} trash files during restore due to missing cache records`,
            skippedFileIDs,
        );
    }
    if (files.length === 0) {
        throw new Error(
            "Unable to restore files: missing encrypted metadata in local cache. Please refresh and try again.",
        );
    }

    const res = await fetch(await apiURL("/collections/restore-files"), {
        method: "POST",
        headers: {
            ...(await authenticatedRequestHeaders()),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ collectionID: targetCollectionID, files }),
    });
    ensureOk(res);
};

export const deleteCollectionKeepingFiles = async (
    collection: LockerCollection,
    masterKey: string,
): Promise<void> => {
    await deleteCollectionKeepingFilesWithDeps(collection, {
        currentUserID: ensureLocalUser().id,
        masterKey,
        deps: createCollectionMutationDeps(),
    });
    await deleteCollection(collection.id, { keepFiles: true });
};

export const leaveCollection = async (collectionID: number): Promise<void> => {
    const res = await fetch(
        await apiURL(`/collections/leave/${collectionID}`),
        { method: "POST", headers: await authenticatedRequestHeaders() },
    );
    ensureOk(res);
};

export const setItemImportant = async (
    fileID: number,
    shouldBeImportant: boolean,
    masterKey: string,
): Promise<boolean> => {
    const currentUserID = ensureLocalUser().id;
    const currentCollectionIDs = getCollectionIDsForFile(fileID);
    if (currentCollectionIDs.length === 0) {
        throw new Error(`File ${fileID} not found in cache`);
    }

    const favoritesCollection = findCollectionByType(
        "favorites",
        currentUserID,
    );
    if (!shouldBeImportant && !favoritesCollection) {
        return false;
    }

    const favoritesCollectionID =
        favoritesCollection?.id ??
        (await ensureFavoritesCollection(masterKey)).id;
    const nextCollectionIDs = shouldBeImportant
        ? Array.from(new Set([...currentCollectionIDs, favoritesCollectionID]))
        : currentCollectionIDs.filter(
              (collectionID) => collectionID !== favoritesCollectionID,
          );

    const hasChanged =
        nextCollectionIDs.length !== currentCollectionIDs.length ||
        nextCollectionIDs.some(
            (collectionID) => !currentCollectionIDs.includes(collectionID),
        );
    if (!hasChanged) {
        return false;
    }

    await updateItemCollectionsWithDeps(fileID, nextCollectionIDs, {
        currentUserID,
        masterKey,
        deps: createCollectionMutationDeps(),
    });
    return true;
};

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
