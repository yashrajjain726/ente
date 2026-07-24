import {
    canAddToCollection,
    canMoveToCollection,
    collectionsSortBy,
    sortCollectionSummaries,
    type CollectionsSortBy,
    type CollectionSummary,
} from "ente-new/photos/services/collection-summary";
import { includes } from "ente-utils/type-guards";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    CollectionSelectorAction,
    CollectionSelectorProps,
} from "./CollectionSelector";

type UseCollectionSelectorProps = CollectionSelectorProps & {
    createCollectionLabel: string;
};

export const useCollectionSelector = ({
    open,
    onClose,
    onExited,
    attributes,
    collectionSummaries,
    collectionForCollectionSummaryID,
    createCollectionLabel,
}: UseCollectionSelectorProps) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] =
        useCollectionSelectorSortByLocalState("name-asc");
    const [filteredCollections, setFilteredCollections] = useState<
        CollectionSummary[]
    >([]);

    const handleExited = useCallback(() => {
        setSearchTerm("");
        onExited?.();
    }, [onExited]);

    useEffect(() => {
        if (!attributes || !open) return;

        const activeCollectionID = attributes.activeCollectionID;
        const selectableCollections = [...collectionSummaries.values()].filter(
            (collectionSummary) => {
                if (
                    collectionSummary.id ===
                    attributes.sourceCollectionSummaryID
                ) {
                    return false;
                }

                const isUserFavorites =
                    collectionSummary.type === "userFavorites";
                if (
                    attributes.action === "add" ||
                    attributes.action === "move"
                ) {
                    return (
                        canAddToCollection(collectionSummary) &&
                        !isUserFavorites
                    );
                }
                if (attributes.action === "upload") {
                    return (
                        (canAddToCollection(collectionSummary) ||
                            collectionSummary.type === "uncategorized") &&
                        !isUserFavorites
                    );
                }
                if (attributes.action === "restore") {
                    return (
                        (canMoveToCollection(collectionSummary) ||
                            collectionSummary.type === "uncategorized") &&
                        !isUserFavorites
                    );
                }
                return (
                    canMoveToCollection(collectionSummary) && !isUserFavorites
                );
            },
        );

        const collections = sortCollectionSummaries(
            selectableCollections,
            sortBy,
        )
            .sort((a, b) => b.sortPriority - a.sortPriority)
            .sort((a, b) => {
                if (a.id === activeCollectionID) return -1;
                if (b.id === activeCollectionID) return 1;
                return 0;
            });

        if (collections.length === 0) {
            onClose();
            attributes.onCreateCollection();
            handleExited();
        }

        setFilteredCollections(collections);
    }, [collectionSummaries, attributes, open, onClose, sortBy, handleExited]);

    const searchFilteredCollections = useMemo(() => {
        if (!searchTerm.trim()) return filteredCollections;
        const searchLower = searchTerm.toLowerCase();
        return filteredCollections.filter((collectionSummary) =>
            collectionSummary.name.toLowerCase().includes(searchLower),
        );
    }, [filteredCollections, searchTerm]);

    const showCreateButton =
        !searchTerm.trim() ||
        createCollectionLabel.toLowerCase().includes(searchTerm.toLowerCase());

    const handleCollectionSummaryClick = async (id: number) => {
        if (!attributes) return;
        attributes.onSelectCollection(
            await collectionForCollectionSummaryID(id),
        );
        onClose();
    };

    const handleClose = () => {
        attributes?.onCancel?.();
        onClose();
    };

    return {
        attributes,
        searchTerm,
        setSearchTerm,
        sortBy,
        setSortBy,
        filteredCollections,
        searchFilteredCollections,
        showCreateButton,
        handleExited,
        handleCollectionSummaryClick,
        handleClose,
    };
};

export const collectionSelectorTitle = (action: CollectionSelectorAction) => {
    switch (action) {
        case "upload":
            return t("upload_to_album");
        case "add":
            return t("add_to_album");
        case "move":
            return t("move_to_album");
        case "restore":
            return t("restore_to_album");
        case "unhide":
            return t("unhide_to_album");
    }
};

const useCollectionSelectorSortByLocalState = (
    initialValue: CollectionsSortBy,
) => {
    const key = "collectionSelectorSortBy";
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        const storedValue = localStorage.getItem(key);
        if (storedValue && includes(collectionsSortBy, storedValue)) {
            setValue(storedValue);
        }
    }, []);

    const setter = (newValue: CollectionsSortBy) => {
        localStorage.setItem(key, newValue);
        setValue(newValue);
    };

    return [value, setter] as const;
};
