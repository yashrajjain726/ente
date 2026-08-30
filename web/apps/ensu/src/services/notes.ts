import { isTauriRuntime } from "@/services/tauri-runtime";

export interface NotesCollection {
    id: string;
    label: string;
    status:
        | "indexing"
        | "updating"
        | "ready"
        | "pending"
        | "unavailable"
        | "error";
    indexingProgress: number | null;
    indexedDocumentCount: number;
    lastUpdatedAtMs: number | null;
    updateDueAtMs: number | null;
    lastError: string | null;
}

const invokeNotes = async <T>(
    command: string,
    args?: Record<string, unknown>,
) => {
    if (!isTauriRuntime()) {
        throw new Error("Your Notes is only available in the desktop app");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
};

export const selectNotesFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
};

export const listNotesCollections = () =>
    invokeNotes<NotesCollection[]>("notes_list_collections");

export const hasAvailableNotesIndex = () =>
    invokeNotes<boolean>("notes_has_available_index");

export const addNotesCollection = (sourceRoot: string) =>
    invokeNotes<NotesCollection>("notes_add_collection", { sourceRoot });

export const removeNotesCollection = (collectionId: string) =>
    invokeNotes<null>("notes_remove_collection", { collectionId });

export const indexNotesCollection = (
    collectionId: string,
    force: boolean,
    retrievalEpoch: number,
) =>
    invokeNotes<{ collection: NotesCollection; hasMore: boolean }>(
        "notes_index_collection",
        { collectionId, force, retrievalEpoch },
    );

export const listenForNotesStateChanged = async (
    onStateChanged: (collection: NotesCollection) => void,
) => {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<NotesCollection>("notes-state-changed", (event) =>
        onStateChanged(event.payload),
    );
};

export const openNoteDocument = (collectionId: string, documentId: string) =>
    invokeNotes<null>("notes_open_document", { collectionId, documentId });

const commandError = (error: unknown) =>
    (error && typeof error === "object" ? error : {}) as {
        name?: unknown;
        message?: unknown;
    };

export const notesErrorMessage = (error: unknown) => {
    const { name, message } = commandError(error);
    switch (name) {
        case "duplicate":
            return "That folder is already in Your Notes.";
        case "nested":
            return "Choose a folder that does not contain another Notes folder.";
        case "invalid_folder":
        case "unavailable":
        case "source_unavailable":
            return "That folder is unavailable. Check its location and permissions.";
        case "embedding_missing":
            return "The knowledge embedding model must be downloaded first.";
        default:
            return typeof message === "string"
                ? message
                : "Your Notes could not be updated. Please try again.";
    }
};

export const noteSourceErrorMessage = (error: unknown) => {
    const { name } = commandError(error);
    return name === "open_failed"
        ? "The note could not be opened."
        : "Source no longer available.";
};
