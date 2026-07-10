import { base64ToBytes } from "@/services/base64";
import { isTauriRuntime } from "@/services/tauri-runtime";
import log from "ente-base/log";
import { deleteDB, openDB, type DBSchema } from "idb";
import { localChatMigrationSourceKeys } from "./chatKey";
import {
    finalizeLocalChatMigration,
    isLocalChatMigrationDone,
} from "./keyMigration";
import {
    chatDb,
    decryptMessageTextStrict,
    decryptSessionTitleStrict,
    deserializeAttachmentsStrict,
    invokeChat,
    pruneOrphanedAttachmentBytes,
    writeAttachmentBytes,
    type StoredAttachment,
    type StoredMessage,
    type StoredSession,
} from "./store";

const LOCAL_STORAGE_STORE = "ensu.chat.store.v1";
const TOMBSTONE_MIGRATION = "ensu.chat.localMigration.v2";
const OLD_INDEXED_DB = "ensu.chat.db";

type OldSession = StoredSession & {
    deletedAt?: number | null;
    isDeleted?: boolean;
};
type OldMessage = Omit<StoredMessage, "attachments"> & {
    attachments?: (StoredAttachment & { uploadedAt?: number | null })[];
    deletedAt?: number | null;
    isDeleted?: boolean;
};
type AttachmentBytes = { id: string; data: Uint8Array<ArrayBuffer> };
type BrowserStore = {
    sessions: OldSession[];
    messages: OldMessage[];
    attachmentBytes: AttachmentBytes[];
};

interface OldIndexedDb extends DBSchema {
    sessions: { key: string; value: OldSession };
    messages: { key: string; value: OldMessage };
    attachmentBytes: { key: string; value: AttachmentBytes };
}

let _initPromise: Promise<void> | undefined;

const liveStore = (
    sessions: OldSession[],
    messages: OldMessage[],
    attachmentBytes: AttachmentBytes[],
): BrowserStore => {
    const liveSessions = sessions.filter(
        ({ deletedAt, isDeleted }) => !deletedAt && !isDeleted,
    );
    const sessionIDs = new Set(
        liveSessions.map(({ sessionUuid }) => sessionUuid),
    );
    return {
        sessions: liveSessions,
        messages: messages.filter(
            ({ sessionUuid, deletedAt, isDeleted }) =>
                !deletedAt && !isDeleted && sessionIDs.has(sessionUuid),
        ),
        attachmentBytes,
    };
};

const localStorageStore = (): BrowserStore => {
    const json = localStorage.getItem(LOCAL_STORAGE_STORE);
    if (!json) return { sessions: [], messages: [], attachmentBytes: [] };
    const parsed = JSON.parse(json) as Partial<{
        sessions: OldSession[];
        messages: OldMessage[];
        attachmentBytes: { id: string; data: string }[];
    }>;
    return liveStore(
        parsed.sessions ?? [],
        parsed.messages ?? [],
        (parsed.attachmentBytes ?? []).map(({ id, data }) => ({
            id,
            data: base64ToBytes(data),
        })),
    );
};

const hasLocalStorageStore = () => !!localStorage.getItem(LOCAL_STORAGE_STORE);

const writeBrowserStore = async (source: BrowserStore) => {
    const db = await chatDb();
    const tx = db.transaction(
        ["sessions", "messages", "attachmentBytes"],
        "readwrite",
    );
    await Promise.all([
        ...source.sessions.map((session) =>
            tx.objectStore("sessions").put(session),
        ),
        ...source.messages.map((message) =>
            tx.objectStore("messages").put(message),
        ),
        ...source.attachmentBytes.map((attachment) =>
            tx.objectStore("attachmentBytes").put(attachment),
        ),
        tx.done,
    ]);
};

const removeCurrentBrowserTombstones = async () => {
    if (localStorage.getItem(TOMBSTONE_MIGRATION) === "1") return;
    const db = await chatDb();
    const [sessions, messages] = await Promise.all([
        db.getAll("sessions") as Promise<OldSession[]>,
        db.getAll("messages") as Promise<OldMessage[]>,
    ]);
    const deletedSessions = new Set(
        sessions
            .filter(({ deletedAt, isDeleted }) => deletedAt || isDeleted)
            .map(({ sessionUuid }) => sessionUuid),
    );
    const deletedMessages = messages.filter(
        ({ sessionUuid, deletedAt, isDeleted }) =>
            deletedAt || isDeleted || deletedSessions.has(sessionUuid),
    );
    const tx = db.transaction(["sessions", "messages"], "readwrite");
    await Promise.all([
        ...deletedSessions
            .values()
            .map((id) => tx.objectStore("sessions").delete(id)),
        ...deletedMessages.map(({ messageUuid }) =>
            tx.objectStore("messages").delete(messageUuid),
        ),
        tx.done,
    ]);
    localStorage.setItem(TOMBSTONE_MIGRATION, "1");
};

const hasIndexedDb = async (name: string) => {
    return (await indexedDB.databases()).some(
        (database) => database.name === name,
    );
};

const readOldIndexedDb = async () => {
    if (!(await hasIndexedDb(OLD_INDEXED_DB))) return undefined;
    const source = await openDB<OldIndexedDb>(OLD_INDEXED_DB);
    try {
        return liveStore(
            await source.getAll("sessions"),
            await source.getAll("messages"),
            await source.getAll("attachmentBytes"),
        );
    } finally {
        source.close();
    }
};

const hasChatData = ({ sessions, messages }: BrowserStore) =>
    sessions.length > 0 || messages.length > 0;

const cleanupOldBrowserStores = () => {
    try {
        localStorage.removeItem(LOCAL_STORAGE_STORE);
    } catch (error) {
        log.warn("Failed to remove the old local chat store", error);
    }
    void deleteDB(OLD_INDEXED_DB, {
        blocked: () => log.warn("Waiting for the old chat DB to close"),
    }).catch((error: unknown) =>
        log.warn("Failed to remove the old chat DB", error),
    );
};

const importOldBrowserStores = async () => {
    const current = await chatDb();
    const [sessions, messages] = await Promise.all([
        current.getAll("sessions"),
        current.getAll("messages"),
    ]);
    if (sessions.length || messages.length) {
        cleanupOldBrowserStores();
        return;
    }

    const indexedDbStore = await readOldIndexedDb();
    const source =
        indexedDbStore && hasChatData(indexedDbStore)
            ? indexedDbStore
            : hasLocalStorageStore()
              ? localStorageStore()
              : undefined;
    if (source && hasChatData(source)) {
        await writeBrowserStore(source);
    }
    cleanupOldBrowserStores();
};

const localStorageSourceKey = async (
    source: BrowserStore,
    sourceKeys: string[],
) => {
    for (const key of sourceKeys) {
        try {
            if (source.sessions[0]) {
                await decryptSessionTitleStrict(source.sessions[0], key);
            } else if (source.messages[0]) {
                await decryptMessageTextStrict(source.messages[0], key);
            }
            return key;
        } catch {
            // Try the next migration-only key.
        }
    }
    throw new Error("No stored key could decrypt the old local chat store");
};

const importLocalStorageToNative = async (sourceKeys: string[]) => {
    const source = localStorageStore();
    const sourceKey = await localStorageSourceKey(source, sourceKeys);
    for (const session of source.sessions.sort(
        (left, right) => left.createdAt - right.createdAt,
    )) {
        await invokeChat("chat_db_upsert_session", {
            input: {
                sessionUuid: session.sessionUuid,
                title: await decryptSessionTitleStrict(session, sourceKey),
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            },
        });
    }
    for (const message of source.messages.sort(
        (left, right) => left.createdAt - right.createdAt,
    )) {
        const attachments = await deserializeAttachmentsStrict(
            message.attachments,
            sourceKey,
        );
        await invokeChat("chat_db_insert_message_with_uuid", {
            input: {
                messageUuid: message.messageUuid,
                sessionUuid: message.sessionUuid,
                parentMessageUuid: message.parentMessageUuid ?? null,
                sender: message.sender,
                text: await decryptMessageTextStrict(message, sourceKey),
                createdAt: message.createdAt,
                attachments: attachments.map(({ id, kind, name, size }) => ({
                    id,
                    kind,
                    name,
                    size,
                })),
            },
        });
    }
    for (const { id, data } of source.attachmentBytes) {
        await writeAttachmentBytes(id, data);
    }
};

const distinctKeys = (keys: (string | undefined)[]) =>
    keys.filter(
        (key, index, values): key is string =>
            !!key && values.indexOf(key) === index,
    );

const migrate = async (chatKey: string) => {
    if (isTauriRuntime()) {
        const migrationPending = !isLocalChatMigrationDone();
        const sourceKeys = distinctKeys([
            chatKey,
            ...(migrationPending ? localChatMigrationSourceKeys() : []),
        ]);
        await invokeChat("chat_db_open", {
            input: { keyB64: chatKey, recoveryKeysB64: sourceKeys },
        });
        if (migrationPending) {
            if (hasLocalStorageStore()) {
                await importLocalStorageToNative(sourceKeys);
            }
            await finalizeLocalChatMigration();
        }
    } else {
        await removeCurrentBrowserTombstones();
        await importOldBrowserStores();
    }
    try {
        await pruneOrphanedAttachmentBytes();
    } catch (error) {
        log.warn("Failed to prune orphaned attachment payloads", error);
    }
};

export const initializeChatStorePersistence = async (chatKey: string) => {
    if (_initPromise) return _initPromise;
    const promise = migrate(chatKey).catch((error: unknown) => {
        if (_initPromise === promise) {
            _initPromise = undefined;
        }
        log.error("Failed to initialize chat persistence", error);
        throw error;
    });
    _initPromise = promise;
    return promise;
};
