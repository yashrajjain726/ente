import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import type { Collection } from "ente-media/collection";
import type { CollectionSummaries } from "ente-new/photos/services/collection-summary";
import React from "react";
import { CollectionSelectorV2 } from "./CollectionSelectorV2";

export type CollectionSelectorAction =
    | "upload"
    | "add"
    | "move"
    | "restore"
    | "unhide";

export interface CollectionSelectorAttributes {
    /**
     * The {@link action} modifies the title of the dialog, and also removes
     * some system collections that don't might not make sense for that
     * particular action.
     */
    action: CollectionSelectorAction;
    /**
     * Some actions, like "add" and "move", happen in the context of an existing
     * collection summary.
     *
     * In such cases, the ID of the collection summary can be set as the
     * {@link sourceCollectionID} to omit showing it in the list again.
     */
    sourceCollectionSummaryID?: number;
    /**
     * If set, this collection will be shown first in the list.
     *
     * This is useful for the "upload" action, where the user is viewing a
     * specific collection and might want to upload to it.
     */
    activeCollectionID?: number;
    /**
     * If true, only show hidden albums in the collection selector.
     *
     * This is used when uploading from the hidden albums section.
     */
    showHiddenCollections?: boolean;
    /**
     * Callback invoked when the user selects the option to create a new
     * collection.
     */
    onCreateCollection: () => void;
    /**
     * Callback invoked when the user selects one the existing collections
     * listed in the dialog.
     */
    onSelectCollection: (collection: Collection) => void;
    /**
     * Callback invoked when the user cancels the collection selection dialog.
     */
    onCancel?: () => void;
}

export type CollectionSelectorProps = ModalVisibilityProps & {
    /** Callback fired after the selector has finished closing. */
    onExited?: () => void;
    /**
     * The same {@link CollectionSelector} can be used for different
     * purposes by customizing the {@link attributes} prop before opening it.
     */
    attributes: CollectionSelectorAttributes | undefined;
    /**
     * The collections to list.
     *
     * The picker does not list all of the collection summaries, it filters
     * these provided list down to values which make sense for the
     * {@link attribute}'s {@link action}.
     *
     * See: [Note: Picking from selectable collection summaries].
     */
    collectionSummaries: CollectionSummaries;
    /**
     * A function to map from a collection summary ID to a {@link Collection}.
     *
     * This is invoked when the user makes a selection, to convert the ID of the
     * selected collection summary into a collection object that can be passed
     * as the {@link callback} property of {@link CollectionSelectorAttributes}.
     *
     * [Note: Picking from selectable collection summaries]
     *
     * In general, not all pseudo collections can be converted into a
     * collection. For example, there is no underlying collection corresponding
     * to the "All" pseudo collection. However, the implementation of
     * {@link CollectionSelector} is such that it filters the provided
     * {@link collectionSummaries} to only show those which, when selected, can
     * be mapped to an (existing or on-demand created) collection.
     */
    collectionForCollectionSummaryID: (
        collectionID: number,
    ) => Promise<Collection>;
};

/**
 * A dialog allowing the user to select one of their existing collections or
 * create a new one.
 */
export const CollectionSelector: React.FC<CollectionSelectorProps> = (
    props,
) => {
    return <CollectionSelectorV2 {...props} />;
};
