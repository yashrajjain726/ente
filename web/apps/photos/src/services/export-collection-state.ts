export const deletedExportedCollectionIDs = (
    presentCollectionIDs: Iterable<number>,
    collectionExportNames: Readonly<Record<number, string>> | undefined,
) => {
    if (!collectionExportNames) return [];

    const presentIDs = new Set(presentCollectionIDs);
    return Object.keys(collectionExportNames)
        .map(Number)
        .filter((collectionID) => !presentIDs.has(collectionID));
};
