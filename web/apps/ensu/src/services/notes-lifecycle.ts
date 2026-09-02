type NotesIndexRequest = "start" | "queued" | "ignored";

interface NotesIndexCompletion {
    queuedForce?: boolean;
    clearedRemovalWait: boolean;
}

type NotesRemovalStart =
    | { kind: "wait" }
    | { kind: "start"; queuedForce?: boolean };

export class NotesLifecycleController {
    private readonly active = new Set<string>();
    private readonly queued = new Map<string, boolean>();
    private readonly removing = new Set<string>();
    private readonly resumed = new Set<string>();
    private removalWaitCollection: string | null = null;
    private mutation = 0;
    private refreshRequest = 0;
    private disposed = false;

    requestIndex(
        collectionId: string,
        force: boolean,
        blocked: boolean,
    ): NotesIndexRequest {
        if (this.disposed || this.removing.has(collectionId)) return "ignored";
        if (blocked || this.active.has(collectionId)) {
            this.queueIndex(collectionId, force);
            return "queued";
        }
        this.resumed.add(collectionId);
        this.active.add(collectionId);
        return "start";
    }

    queueIndex(collectionId: string, force: boolean) {
        if (this.disposed || this.removing.has(collectionId)) return;
        this.queued.set(
            collectionId,
            force || (this.queued.get(collectionId) ?? false),
        );
    }

    canContinueIndex(collectionId: string) {
        return (
            !this.disposed &&
            this.active.has(collectionId) &&
            !this.removing.has(collectionId)
        );
    }

    finishIndex(collectionId: string): NotesIndexCompletion {
        this.active.delete(collectionId);
        const queuedForce = this.queued.get(collectionId);
        this.queued.delete(collectionId);
        const clearedRemovalWait = this.removalWaitCollection === collectionId;
        if (clearedRemovalWait) this.removalWaitCollection = null;
        return { queuedForce, clearedRemovalWait };
    }

    drainQueued(blocked: boolean) {
        if (this.disposed || blocked) return [] as [string, boolean][];
        const ready: [string, boolean][] = [];
        for (const [collectionId, force] of this.queued) {
            if (
                this.active.has(collectionId) ||
                this.removing.has(collectionId)
            ) {
                continue;
            }
            this.queued.delete(collectionId);
            ready.push([collectionId, force]);
        }
        return ready;
    }

    beginRemoval(collectionId: string): NotesRemovalStart {
        if (this.active.has(collectionId)) {
            this.removalWaitCollection = collectionId;
            return { kind: "wait" };
        }
        const queuedForce = this.queued.get(collectionId);
        this.queued.delete(collectionId);
        this.removing.add(collectionId);
        return { kind: "start", queuedForce };
    }

    cancelRemoval(collectionId: string) {
        this.removing.delete(collectionId);
    }

    finishRemoval(collectionId: string) {
        this.removing.delete(collectionId);
        this.resumed.delete(collectionId);
        if (this.removalWaitCollection === collectionId) {
            this.removalWaitCollection = null;
        }
    }

    isRemoving(collectionId: string) {
        return this.removing.has(collectionId);
    }

    markResumed(collectionId: string) {
        if (this.disposed || this.resumed.has(collectionId)) return false;
        this.resumed.add(collectionId);
        return true;
    }

    hasActiveJobs() {
        return this.active.size > 0;
    }

    markMutation() {
        this.mutation += 1;
    }

    beginRefresh() {
        this.refreshRequest += 1;
        return this.refreshRequest;
    }

    refreshMutationSnapshot() {
        return this.mutation;
    }

    isRefreshCurrent(request: number) {
        return !this.disposed && request === this.refreshRequest;
    }

    canApplyRefresh(request: number, mutation: number) {
        return this.isRefreshCurrent(request) && mutation === this.mutation;
    }

    cancelRefreshes() {
        this.refreshRequest += 1;
    }

    activate() {
        this.disposed = false;
    }

    dispose() {
        this.disposed = true;
        this.active.clear();
        this.queued.clear();
        this.removing.clear();
        this.cancelRefreshes();
    }
}
