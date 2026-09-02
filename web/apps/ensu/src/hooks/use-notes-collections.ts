import type { LlmProvider } from "@/services/llm/provider";
import {
    addNotesCollection,
    indexNotesCollection,
    listenForNotesStateChanged,
    listNotesCollections,
    notesErrorMessage,
    removeNotesCollection,
    selectNotesFolder,
    type NotesCollection,
} from "@/services/notes";
import { NotesLifecycleController } from "@/services/notes-lifecycle";
import { isNamedError } from "ente-base/error";
import log from "ente-base/log";
import { useCallback, useEffect, useRef, useState } from "react";

const NOTES_INDEX_RERUN_YIELD_MS = 25;
const NOTES_REMOVE_WAIT_ERROR =
    "Wait for indexing to finish, then remove this folder.";

interface UseNotesCollectionsOptions {
    isTauriRuntime: boolean;
    isGenerating: boolean;
    isGenerationStarting: () => boolean;
    modelReady: boolean;
    ensureProvider: () => Promise<LlmProvider>;
    cancelIndexing: () => void;
    confirmRemoval: (label: string, remove: () => Promise<void>) => void;
}

export const useNotesCollections = ({
    isTauriRuntime,
    isGenerating,
    isGenerationStarting,
    modelReady,
    ensureProvider,
    cancelIndexing,
    confirmRemoval,
}: UseNotesCollectionsOptions) => {
    const [collections, setCollections] = useState<NotesCollection[]>([]);
    const [loading, setLoading] = useState(false);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [subscriptionError, setSubscriptionError] = useState<string | null>(
        null,
    );
    const [syncAttempt, setSyncAttempt] = useState(0);
    const controllerRef = useRef<NotesLifecycleController | null>(null);
    if (!controllerRef.current) {
        controllerRef.current = new NotesLifecycleController();
    }
    const controller = controllerRef.current;
    const runIndexRef = useRef<
        ((collectionId: string, force?: boolean) => void) | null
    >(null);

    useEffect(() => {
        controller.activate();
        return () => {
            if (controller.hasActiveJobs()) cancelIndexing();
            controller.dispose();
        };
    }, [cancelIndexing, controller]);

    const refresh = useCallback(async () => {
        if (!isTauriRuntime) return;
        const request = controller.beginRefresh();
        setLoading(true);
        try {
            while (controller.isRefreshCurrent(request)) {
                const mutation = controller.refreshMutationSnapshot();
                try {
                    const next = await listNotesCollections();
                    if (!controller.isRefreshCurrent(request)) return;
                    if (!controller.canApplyRefresh(request, mutation)) {
                        continue;
                    }
                    setCollections(next);
                    setListError(null);
                    return;
                } catch (error) {
                    if (!controller.isRefreshCurrent(request)) return;
                    if (!controller.canApplyRefresh(request, mutation)) {
                        continue;
                    }
                    setListError(notesErrorMessage(error));
                    log.error("Failed to refresh Your Notes", error);
                    return;
                }
            }
        } finally {
            if (controller.isRefreshCurrent(request)) setLoading(false);
        }
    }, [controller, isTauriRuntime]);

    const replaceCollection = useCallback(
        (collection: NotesCollection) => {
            controller.markMutation();
            setCollections((current) => {
                const exists = current.some(
                    (item) => item.id === collection.id,
                );
                return exists
                    ? current.map((item) =>
                          item.id === collection.id ? collection : item,
                      )
                    : [...current, collection];
            });
        },
        [controller],
    );

    const updateCollection = useCallback(
        (collection: NotesCollection) => {
            controller.markMutation();
            setCollections((current) =>
                current.map((item) =>
                    item.id === collection.id ? collection : item,
                ),
            );
        },
        [controller],
    );

    const runIndex = useCallback(
        (collectionId: string, force = false) => {
            const request = controller.requestIndex(
                collectionId,
                force,
                isGenerating || isGenerationStarting(),
            );
            if (request !== "start") return;
            setOperationError(null);

            void ensureProvider()
                .then((provider) =>
                    provider.withKnowledgeRetrieval(
                        async (retrievalEpoch) => {
                            let needsRerun = true;
                            let bypassQuietPeriod = force;
                            while (
                                needsRerun &&
                                controller.canContinueIndex(collectionId)
                            ) {
                                const result = await indexNotesCollection(
                                    collectionId,
                                    bypassQuietPeriod,
                                    retrievalEpoch,
                                );
                                if (
                                    !controller.canContinueIndex(collectionId)
                                ) {
                                    return;
                                }
                                bypassQuietPeriod = false;
                                replaceCollection(result.collection);
                                needsRerun = result.needsRerun;
                                if (needsRerun) {
                                    await new Promise<void>((resolve) =>
                                        window.setTimeout(
                                            resolve,
                                            NOTES_INDEX_RERUN_YIELD_MS,
                                        ),
                                    );
                                }
                            }
                        },
                        () => controller.canContinueIndex(collectionId),
                    ),
                )
                .catch((error: unknown) => {
                    if (controller.isRemoving(collectionId)) return;
                    if (isNamedError(error, "cancelled")) {
                        controller.queueIndex(collectionId, force);
                    } else if (!isNamedError(error, "not_due")) {
                        setOperationError(notesErrorMessage(error));
                        log.error("Failed to index Your Notes", error);
                    }
                    void refresh();
                })
                .finally(() => {
                    const completion = controller.finishIndex(collectionId);
                    if (completion.queuedForce !== undefined) {
                        runIndexRef.current?.(
                            collectionId,
                            completion.queuedForce,
                        );
                    } else if (completion.clearedRemovalWait) {
                        setOperationError((current) =>
                            current === NOTES_REMOVE_WAIT_ERROR
                                ? null
                                : current,
                        );
                    }
                });
        },
        [
            controller,
            ensureProvider,
            isGenerating,
            isGenerationStarting,
            refresh,
            replaceCollection,
        ],
    );
    runIndexRef.current = runIndex;

    useEffect(() => {
        for (const [collectionId, force] of controller.drainQueued(
            isGenerating || isGenerationStarting(),
        )) {
            runIndex(collectionId, force);
        }
    }, [controller, isGenerating, isGenerationStarting, runIndex]);

    useEffect(() => {
        if (!isTauriRuntime) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        const initialRefresh = refresh();
        const refreshAfterSubscription = async () => {
            await initialRefresh;
            if (!disposed) await refresh();
        };
        void listenForNotesStateChanged((collection) => {
            if (!disposed) updateCollection(collection);
        })
            .then(async (listener) => {
                if (disposed) {
                    listener();
                    return;
                }
                unlisten = listener;
                setSubscriptionError(null);
                await refreshAfterSubscription();
            })
            .catch((error: unknown) => {
                if (disposed) return;
                setSubscriptionError(notesErrorMessage(error));
                log.error("Failed to listen for Your Notes updates", error);
            });
        return () => {
            disposed = true;
            controller.cancelRefreshes();
            unlisten?.();
        };
    }, [controller, isTauriRuntime, refresh, syncAttempt, updateCollection]);

    useEffect(() => {
        if (!isTauriRuntime || !modelReady) return;
        const timeouts: number[] = [];
        const now = Date.now();
        for (const collection of collections) {
            if (
                collection.updateDueAtMs != null &&
                (collection.status === "ready" ||
                    collection.status === "pending")
            ) {
                timeouts.push(
                    window.setTimeout(
                        () => runIndex(collection.id),
                        Math.max(0, collection.updateDueAtMs - now),
                    ),
                );
            }
        }
        return () => {
            for (const timeout of timeouts) window.clearTimeout(timeout);
        };
    }, [collections, isTauriRuntime, modelReady, runIndex]);

    useEffect(() => {
        if (!isTauriRuntime || !modelReady) return;
        for (const collection of collections) {
            if (
                collection.status === "pending" &&
                collection.updateDueAtMs == null &&
                controller.markResumed(collection.id)
            ) {
                runIndex(collection.id);
            }
        }
    }, [collections, controller, isTauriRuntime, modelReady, runIndex]);

    const retry = useCallback(() => {
        setOperationError(null);
        setSyncAttempt((attempt) => attempt + 1);
    }, []);

    const addFolder = useCallback(async () => {
        setOperationError(null);
        try {
            const sourceRoot = await selectNotesFolder();
            if (!sourceRoot) return;
            const collection = await addNotesCollection(sourceRoot);
            replaceCollection(collection);
            runIndex(collection.id);
        } catch (error) {
            setOperationError(notesErrorMessage(error));
            log.error("Failed to add Notes folder", error);
        }
    }, [replaceCollection, runIndex]);

    const removeCollection = useCallback(
        (collectionId: string, label: string) => {
            confirmRemoval(label, async () => {
                const removal = controller.beginRemoval(collectionId);
                if (removal.kind === "wait") {
                    setOperationError(NOTES_REMOVE_WAIT_ERROR);
                    return;
                }
                setOperationError(null);
                try {
                    await removeNotesCollection(collectionId);
                    controller.markMutation();
                    controller.finishRemoval(collectionId);
                    setCollections((current) =>
                        current.filter((item) => item.id !== collectionId),
                    );
                } catch (error) {
                    controller.cancelRemoval(collectionId);
                    setOperationError(notesErrorMessage(error));
                    log.error("Failed to remove Notes collection", error);
                    void refresh();
                    if (removal.queuedForce !== undefined) {
                        runIndexRef.current?.(
                            collectionId,
                            removal.queuedForce,
                        );
                    }
                }
            });
        },
        [confirmRemoval, controller, refresh],
    );

    return {
        collections,
        loading,
        error: subscriptionError ?? listError ?? operationError,
        retry,
        addFolder,
        removeCollection,
        runIndex,
    };
};
