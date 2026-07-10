import { base64ToBytes } from "@/services/base64";
import { isTauriRuntime } from "@/services/tauri-runtime";
import { getKV, removeKV, setKV } from "ente-base/kv";
import log from "ente-base/log";
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { decryptAttachmentBytes, encryptAttachmentBytes } from "./attachments";
import {
    finalizeLocalChatMigration,
    isLocalChatMigrationDone,
} from "./chatKey";
import {
    decryptChatField,
    decryptChatPayload,
    encryptChatField,
    encryptChatPayload,
} from "./crypto";

const STORAGE_KEY = "ensu.chat.store.v1";
const LOCAL_SCHEMA_MIGRATION_KEY = "ensu.chat.localMigration.v2";
const CHAT_DB_NAME = "ensu-chat";
const V1_WEB_CHAT_DB_NAME = "ensu.chat.db";

export type AttachmentKind = "image" | "document";

export interface ChatAttachment {
    id: string;
    kind: AttachmentKind;
    name: string;
    size: number;
    encryptedName?: string;
}

interface StoredAttachment {
    id: string;
    kind: AttachmentKind;
    size: number;
    encryptedName: string;
}

interface StoredSession {
    sessionUuid: string;
    createdAt: number;
    updatedAt: number;
    encryptedData: string;
    header: string;
}

interface StoredMessage {
    messageUuid: string;
    sessionUuid: string;
    parentMessageUuid?: string;
    sender: "self" | "assistant";
    createdAt: number;
    encryptedData: string;
    header: string;
    attachments?: StoredAttachment[];
}

type OldStoredAttachment = StoredAttachment & { uploadedAt?: number | null };

type OldStoredSession = StoredSession & {
    deletedAt?: number | null;
    isDeleted?: boolean;
};

type OldStoredMessage = Omit<StoredMessage, "attachments"> & {
    attachments?: OldStoredAttachment[];
    deletedAt?: number | null;
    isDeleted?: boolean;
};

interface StoredAttachmentBytes {
    id: string;
    data: Uint8Array<ArrayBuffer>;
}

interface ChatDbSchema {
    sessions: StoredSession;
    messages: StoredMessage;
    attachmentBytes: StoredAttachmentBytes;
}

type ChatStoreName = keyof ChatDbSchema;

type PersistedAttachmentBytes = { id: string; data: string };

type PersistedChatStore = {
    sessions: OldStoredSession[];
    messages: OldStoredMessage[];
    attachmentBytes: PersistedAttachmentBytes[];
};

type ChatStoreState = {
    sessions: StoredSession[];
    messages: StoredMessage[];
    attachmentBytes: StoredAttachmentBytes[];
};

interface IndexedChatDBSchema extends DBSchema {
    sessions: { key: string; value: StoredSession };
    messages: { key: string; value: StoredMessage };
    attachmentBytes: { key: string; value: StoredAttachmentBytes };
}

interface ChatObjectStore<K extends ChatStoreName> {
    get: (key: string) => Promise<ChatDbSchema[K] | undefined>;
    getAll: () => Promise<ChatDbSchema[K][]>;
    put: (value: ChatDbSchema[K]) => Promise<void>;
    delete: (key: string) => Promise<void>;
}

interface ChatTransaction {
    objectStore: <K extends ChatStoreName>(name: K) => ChatObjectStore<K>;
    done: Promise<void>;
}

interface ChatDbLike {
    get: <K extends ChatStoreName>(
        name: K,
        key: string,
    ) => Promise<ChatDbSchema[K] | undefined>;
    getAll: <K extends ChatStoreName>(name: K) => Promise<ChatDbSchema[K][]>;
    put: <K extends ChatStoreName>(
        name: K,
        value: ChatDbSchema[K],
    ) => Promise<void>;
    transaction: (names: ChatStoreName[], mode: "readwrite") => ChatTransaction;
    close: () => void;
}

export interface ChatSession {
    sessionUuid: string;
    rootSessionUuid: string;
    branchFromMessageUuid?: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    lastMessagePreview?: string;
}

export interface ChatMessage {
    messageUuid: string;
    sessionUuid: string;
    parentMessageUuid?: string;
    sender: "self" | "assistant";
    text: string;
    createdAt: number;
    attachments?: ChatAttachment[];
    isSynthetic?: boolean;
}

interface NativeSession {
    sessionUuid: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    lastMessagePreview?: string | null;
}

interface NativeAttachment {
    id: string;
    kind: AttachmentKind;
    name: string;
    size: number;
}

interface NativeMessage {
    messageUuid: string;
    sessionUuid: string;
    parentMessageUuid?: string | null;
    sender: "self" | "assistant";
    text: string;
    createdAt: number;
    attachments?: NativeAttachment[];
}

const nowMicros = () => Date.now() * 1000;

const formatLogError = (error: unknown) => {
    if (error instanceof Error) {
        const message = error.message || error.name;
        return error.stack ? `${message}\n${error.stack}` : message;
    }
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const loadChatStoreState = (): ChatStoreState => {
    if (typeof localStorage === "undefined") {
        return { sessions: [], messages: [], attachmentBytes: [] };
    }

    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) {
        return { sessions: [], messages: [], attachmentBytes: [] };
    }

    try {
        const parsed = JSON.parse(json) as Partial<PersistedChatStore>;
        const sessions = (parsed.sessions ?? [])
            .map(normalizeOldSession)
            .filter((session): session is StoredSession => !!session);
        const sessionIDs = new Set(
            sessions.map((session) => session.sessionUuid),
        );
        return {
            sessions,
            messages: (parsed.messages ?? [])
                .map(normalizeOldMessage)
                .filter(
                    (message): message is StoredMessage =>
                        !!message && sessionIDs.has(message.sessionUuid),
                ),
            attachmentBytes: (parsed.attachmentBytes ?? []).map(
                (attachment) => ({
                    id: attachment.id,
                    data: base64ToBytes(attachment.data),
                }),
            ),
        };
    } catch (error) {
        log.error("Failed to parse chat store", error);
        throw error;
    }
};

const cloneStoreEntry = <K extends ChatStoreName>(
    name: K,
    value: ChatDbSchema[K],
): ChatDbSchema[K] => {
    if (name === "attachmentBytes") {
        const attachment = value as StoredAttachmentBytes;
        return {
            ...attachment,
            data: new Uint8Array(attachment.data),
        } as ChatDbSchema[K];
    }

    const cloned = { ...value };
    if (name === "messages") {
        const message = cloned as StoredMessage;
        message.attachments = message.attachments?.map((attachment) => ({
            ...attachment,
        }));
    }
    return cloned;
};

let _chatDb: Promise<ChatDbLike> | undefined;
let _chatPersistenceInitPromise: Promise<void> | undefined;
let _chatPersistenceInitKey: string | undefined;

const normalizeOldSession = (
    session: OldStoredSession,
): StoredSession | undefined => {
    if (session.deletedAt || session.isDeleted) return undefined;
    return {
        sessionUuid: session.sessionUuid,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        encryptedData: session.encryptedData,
        header: session.header,
    };
};

const normalizeOldMessage = (
    message: OldStoredMessage,
): StoredMessage | undefined => {
    if (message.deletedAt || message.isDeleted) return undefined;
    return {
        messageUuid: message.messageUuid,
        sessionUuid: message.sessionUuid,
        parentMessageUuid: message.parentMessageUuid,
        sender: message.sender,
        createdAt: message.createdAt,
        encryptedData: message.encryptedData,
        header: message.header,
        attachments: message.attachments?.map((attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            size: attachment.size,
            encryptedName: attachment.encryptedName,
        })),
    };
};

const createIndexedDbChatDb = (
    db: IDBPDatabase<IndexedChatDBSchema>,
): ChatDbLike => ({
    get: async (name, key) => {
        const entry = (await db.get(name, key)) as
            | ChatDbSchema[typeof name]
            | undefined;
        if (!entry) return undefined;
        return cloneStoreEntry(name, entry);
    },
    getAll: async (name) => {
        const entries = (await db.getAll(name)) as ChatDbSchema[typeof name][];
        return entries.map((entry) => cloneStoreEntry(name, entry));
    },
    put: async (name, value) => {
        await db.put(name, cloneStoreEntry(name, value));
    },
    transaction: (names, mode) => {
        const tx = db.transaction(names, mode);
        return {
            objectStore: <K extends ChatStoreName>(
                name: K,
            ): ChatObjectStore<K> => ({
                get: async (key) => {
                    const entry = (await tx.objectStore(name).get(key)) as
                        | ChatDbSchema[K]
                        | undefined;
                    if (!entry) return undefined;
                    return cloneStoreEntry(name, entry);
                },
                getAll: async () => {
                    const entries = (await tx
                        .objectStore(name)
                        .getAll()) as ChatDbSchema[K][];
                    return entries.map((entry) => cloneStoreEntry(name, entry));
                },
                put: async (value: ChatDbSchema[K]) => {
                    await tx
                        .objectStore(name)
                        .put(cloneStoreEntry(name, value));
                },
                delete: async (key: string) => {
                    await tx.objectStore(name).delete(key);
                },
            }),
            done: tx.done,
        };
    },
    close: () => db.close(),
});

const migrateIndexedDbToLocalOnly = async (
    db: IDBPDatabase<IndexedChatDBSchema>,
) => {
    if (localStorage.getItem(LOCAL_SCHEMA_MIGRATION_KEY) === "1") return;

    const [oldSessions, oldMessages] = await Promise.all([
        db.getAll("sessions") as Promise<OldStoredSession[]>,
        db.getAll("messages") as Promise<OldStoredMessage[]>,
    ]);
    const removedSessionIDs = new Set(
        oldSessions
            .filter((session) => !normalizeOldSession(session))
            .map((session) => session.sessionUuid),
    );
    const tx = db.transaction(["sessions", "messages"], "readwrite");
    const sessionStore = tx.objectStore("sessions");
    const messageStore = tx.objectStore("messages");
    const operations: Promise<unknown>[] = [];

    for (const oldSession of oldSessions) {
        const session = normalizeOldSession(oldSession);
        operations.push(
            session
                ? sessionStore.put(session)
                : sessionStore.delete(oldSession.sessionUuid),
        );
    }
    for (const oldMessage of oldMessages) {
        const message = normalizeOldMessage(oldMessage);
        operations.push(
            message && !removedSessionIDs.has(message.sessionUuid)
                ? messageStore.put(message)
                : messageStore.delete(oldMessage.messageUuid),
        );
    }

    await Promise.all([...operations, tx.done]);
    localStorage.setItem(LOCAL_SCHEMA_MIGRATION_KEY, "1");
};

const openChatDb = async () => {
    const db = await openDB<IndexedChatDBSchema>(CHAT_DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains("sessions")) {
                db.createObjectStore("sessions", { keyPath: "sessionUuid" });
            }
            if (!db.objectStoreNames.contains("messages")) {
                db.createObjectStore("messages", { keyPath: "messageUuid" });
            }
            if (!db.objectStoreNames.contains("attachmentBytes")) {
                db.createObjectStore("attachmentBytes", { keyPath: "id" });
            }
        },
    });

    await migrateIndexedDbToLocalOnly(db);
    return createIndexedDbChatDb(db);
};

const chatDb = () => (_chatDb ??= openChatDb());

const normalizeTitleText = (value: string) => value.replace(/\s+/g, " ").trim();

export const sessionTitleFromText = (value: string, fallback = "New chat") => {
    const normalized = normalizeTitleText(value);
    if (!normalized) return fallback;
    if (normalized.length <= 40) return normalized;
    return `${normalized.slice(0, 39)}…`;
};

const safeTitle = (value: unknown) =>
    typeof value === "string"
        ? sessionTitleFromText(value, "New chat")
        : "New chat";

const decryptSessionTitleStrict = async (
    session: StoredSession,
    chatKey: string,
) => {
    const payload = (await decryptChatPayload(
        { encryptedData: session.encryptedData, header: session.header },
        chatKey,
    )) as { title?: string };
    return safeTitle(payload.title);
};

const decryptSessionTitle = (session: StoredSession, chatKey: string) =>
    decryptSessionTitleStrict(session, chatKey).catch((error: unknown) => {
        log.error("Failed to decrypt session payload", error);
        return "New chat";
    });

const decryptMessageTextStrict = async (
    message: StoredMessage,
    chatKey: string,
) => {
    const payload = (await decryptChatPayload(
        { encryptedData: message.encryptedData, header: message.header },
        chatKey,
    )) as { text?: string };
    return typeof payload.text === "string" ? payload.text : "";
};

const decryptMessageText = (message: StoredMessage, chatKey: string) =>
    decryptMessageTextStrict(message, chatKey).catch((error: unknown) => {
        log.error("Failed to decrypt message payload", error);
        return "";
    });

const serializeAttachments = async (
    attachments: ChatAttachment[] = [],
    chatKey: string,
): Promise<StoredAttachment[]> => {
    if (!attachments.length) return [];
    if (!isTauriRuntime()) {
        log.warn(
            "Chat attachments are only supported in the desktop app; ignoring attachments on web.",
        );
        return [];
    }
    return Promise.all(
        attachments.map(async (attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            size: attachment.size,
            encryptedName:
                attachment.encryptedName ??
                (await encryptChatField(attachment.name, chatKey)),
        })),
    );
};

const deserializeAttachments = async (
    attachments: StoredAttachment[] | undefined,
    chatKey: string,
): Promise<ChatAttachment[]> => {
    if (!attachments?.length || !isTauriRuntime()) return [];

    return Promise.all(
        attachments.map(async (attachment) => {
            try {
                const name = await decryptChatField(
                    attachment.encryptedName,
                    chatKey,
                );
                return {
                    id: attachment.id,
                    kind: attachment.kind,
                    size: attachment.size,
                    name,
                    encryptedName: attachment.encryptedName,
                } satisfies ChatAttachment;
            } catch (error) {
                log.error("Failed to decrypt attachment name", error);
                return {
                    id: attachment.id,
                    kind: attachment.kind,
                    size: attachment.size,
                    name: "Attachment",
                    encryptedName: attachment.encryptedName,
                } satisfies ChatAttachment;
            }
        }),
    );
};

const deserializeAttachmentsStrict = async (
    attachments: StoredAttachment[] | undefined,
    chatKey: string,
): Promise<ChatAttachment[]> =>
    Promise.all(
        (attachments ?? []).map(async (attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            size: attachment.size,
            name: await decryptChatField(attachment.encryptedName, chatKey),
        })),
    );

const hasLocalStorageChatStore = () =>
    typeof localStorage !== "undefined" && !!localStorage.getItem(STORAGE_KEY);

const hasIndexedDbDatabase = async (name: string) => {
    if (typeof indexedDB === "undefined") return false;

    if ("databases" in indexedDB && typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases();
        return databases.some((database) => database.name === name);
    }

    return new Promise<boolean>((resolve, reject) => {
        let created = false;
        const request = indexedDB.open(name);

        request.onupgradeneeded = () => {
            created = true;
        };

        request.onsuccess = () => {
            const db = request.result;
            db.close();

            if (!created) {
                resolve(true);
                return;
            }

            const deleteRequest = indexedDB.deleteDatabase(name);
            deleteRequest.onsuccess = () => resolve(false);
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onblocked = () => resolve(false);
        };

        request.onerror = () => reject(request.error);
    });
};

const importLocalStorageChatStoreToIndexedDb = async () => {
    if (typeof localStorage === "undefined") return;

    const localStorageStore = loadChatStoreState();
    if (
        !localStorageStore.sessions.length &&
        !localStorageStore.messages.length &&
        !localStorageStore.attachmentBytes.length
    ) {
        localStorage.removeItem(STORAGE_KEY);
        return;
    }

    log.info("Migrating localStorage chat store to IndexedDB", {
        sessions: localStorageStore.sessions.length,
        messages: localStorageStore.messages.length,
        attachmentBytes: localStorageStore.attachmentBytes.length,
    });

    const db = await chatDb();
    const tx = db.transaction(
        ["sessions", "messages", "attachmentBytes"],
        "readwrite",
    );

    for (const session of localStorageStore.sessions) {
        await tx.objectStore("sessions").put(session);
    }

    for (const message of localStorageStore.messages) {
        await tx.objectStore("messages").put(message);
    }

    for (const attachment of localStorageStore.attachmentBytes) {
        await tx
            .objectStore("attachmentBytes")
            .put({ id: attachment.id, data: new Uint8Array(attachment.data) });
    }

    await tx.done;
    localStorage.removeItem(STORAGE_KEY);
    log.info("Finished migrating localStorage chat store to IndexedDB");
};

const importV1IndexedDbChatStore = async () => {
    if (typeof indexedDB === "undefined") return;
    if (!(await hasIndexedDbDatabase(V1_WEB_CHAT_DB_NAME))) return;

    log.info("Migrating v1 IndexedDB chat store", {
        from: V1_WEB_CHAT_DB_NAME,
        to: CHAT_DB_NAME,
    });

    const [v1Db, db] = await Promise.all([
        openDB<IndexedChatDBSchema>(V1_WEB_CHAT_DB_NAME),
        chatDb(),
    ]);

    let migratedAnyEntries: boolean;
    try {
        const [oldSessions, oldMessages, attachmentBytes] = await Promise.all([
            v1Db.getAll("sessions") as Promise<OldStoredSession[]>,
            v1Db.getAll("messages") as Promise<OldStoredMessage[]>,
            v1Db.getAll("attachmentBytes"),
        ]);
        const sessions = oldSessions
            .map(normalizeOldSession)
            .filter((session): session is StoredSession => !!session);
        const sessionIDs = new Set(
            sessions.map((session) => session.sessionUuid),
        );
        const messages = oldMessages
            .map(normalizeOldMessage)
            .filter(
                (message): message is StoredMessage =>
                    !!message && sessionIDs.has(message.sessionUuid),
            );
        migratedAnyEntries =
            sessions.length > 0 ||
            messages.length > 0 ||
            attachmentBytes.length > 0;

        const tx = db.transaction(
            ["sessions", "messages", "attachmentBytes"],
            "readwrite",
        );

        for (const session of sessions) {
            await tx.objectStore("sessions").put(session);
        }

        for (const message of messages) {
            await tx.objectStore("messages").put(message);
        }

        for (const attachment of attachmentBytes) {
            await tx
                .objectStore("attachmentBytes")
                .put({
                    id: attachment.id,
                    data: new Uint8Array(attachment.data),
                });
        }

        await tx.done;
    } finally {
        v1Db.close();
    }

    await deleteDB(V1_WEB_CHAT_DB_NAME, {
        blocked() {
            log.warn("Waiting for an existing client to close the v1 chat DB");
        },
    });

    log.info(
        migratedAnyEntries
            ? "Finished migrating v1 IndexedDB chat store"
            : "Removed empty v1 IndexedDB chat store",
    );
};

const importLocalStorageChatStoreToNative = async (chatKey: string) => {
    if (!isTauriRuntime() || typeof localStorage === "undefined") return;

    const localStorageStore = loadChatStoreState();
    if (
        !localStorageStore.sessions.length &&
        !localStorageStore.messages.length &&
        !localStorageStore.attachmentBytes.length
    ) {
        return;
    }

    log.info("Migrating localStorage chat store to native DB", {
        sessions: localStorageStore.sessions.length,
        messages: localStorageStore.messages.length,
        attachmentBytes: localStorageStore.attachmentBytes.length,
    });

    const sessions = [...localStorageStore.sessions].sort(
        (left, right) => left.createdAt - right.createdAt,
    );
    for (const session of sessions) {
        await invokeChat("chat_db_upsert_session", {
            keyB64: chatKey,
            input: {
                sessionUuid: session.sessionUuid,
                title: await decryptSessionTitleStrict(session, chatKey),
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            },
        });
    }

    const messages = [...localStorageStore.messages].sort(
        (left, right) => left.createdAt - right.createdAt,
    );
    for (const message of messages) {
        const attachments = await deserializeAttachmentsStrict(
            message.attachments,
            chatKey,
        );
        await invokeChat("chat_db_insert_message_with_uuid", {
            keyB64: chatKey,
            input: {
                messageUuid: message.messageUuid,
                sessionUuid: message.sessionUuid,
                parentMessageUuid: message.parentMessageUuid ?? null,
                sender: message.sender,
                text: await decryptMessageTextStrict(message, chatKey),
                createdAt: message.createdAt,
                attachments: attachments.map((attachment) => ({
                    id: attachment.id,
                    kind: attachment.kind,
                    name: attachment.name,
                    size: attachment.size,
                })),
            },
        });
    }

    for (const attachment of localStorageStore.attachmentBytes) {
        await writeAttachmentBytes(attachment.id, attachment.data);
    }

    log.info("Finished migrating localStorage chat store to native DB");
};

const verifyNativeAttachments = async (chatKey: string) => {
    const sessions = await invokeChat<NativeSession[]>(
        "chat_db_list_sessions",
        { keyB64: chatKey },
    );
    const seen = new Set<string>();
    for (const session of sessions) {
        const messages = await invokeChat<NativeMessage[]>(
            "chat_db_get_messages",
            { keyB64: chatKey, sessionUuid: session.sessionUuid },
        );
        for (const attachment of messages.flatMap(
            ({ attachments }) => attachments ?? [],
        )) {
            if (seen.has(attachment.id)) continue;
            seen.add(attachment.id);
            if (!(await attachmentBytesExists(attachment.id))) continue;
            await decryptAttachmentBytes(
                await readAttachmentBytes(attachment.id),
                chatKey,
                session.sessionUuid,
            );
        }
    }
};

export const initializeChatStorePersistence = async (chatKey: string) => {
    if (_chatPersistenceInitKey === chatKey && _chatPersistenceInitPromise) {
        return _chatPersistenceInitPromise;
    }

    _chatPersistenceInitKey = chatKey;
    const initPromise = (async () => {
        if (isTauriRuntime()) {
            if (!isLocalChatMigrationDone()) {
                await invokeChat("chat_db_import_v1", {
                    input: { keyB64: chatKey },
                });
                if (hasLocalStorageChatStore()) {
                    await importLocalStorageChatStoreToNative(chatKey);
                }
                await verifyNativeAttachments(chatKey);
                await finalizeLocalChatMigration();
            }
        } else if (hasLocalStorageChatStore()) {
            await importLocalStorageChatStoreToIndexedDb();
        } else {
            await importV1IndexedDbChatStore();
        }
    })().catch((error: unknown) => {
        if (_chatPersistenceInitPromise === initPromise) {
            _chatPersistenceInitPromise = undefined;
            _chatPersistenceInitKey = undefined;
        }
        log.error("Failed to initialize chat persistence", error);
        throw error;
    });

    _chatPersistenceInitPromise = initPromise;
    return initPromise;
};

const fetchStore = async () => {
    const db = await chatDb();
    const [sessions, messages] = await Promise.all([
        db.getAll("sessions"),
        db.getAll("messages"),
    ]);
    return { sessions, messages };
};

const invokeChat = async <T>(
    command: string,
    args?: Record<string, unknown>,
) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
};

const listSessionsNative = async (chatKey: string): Promise<ChatSession[]> => {
    const sessions = await invokeChat<NativeSession[]>(
        "chat_db_list_sessions_with_preview",
        { keyB64: chatKey },
    );

    return sessions.map((session) => ({
        sessionUuid: session.sessionUuid,
        rootSessionUuid: session.sessionUuid,
        branchFromMessageUuid: undefined,
        title: safeTitle(session.title),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastMessagePreview: session.lastMessagePreview ?? undefined,
    }));
};

const listMessagesNative = async (
    sessionUuid: string,
    chatKey: string,
): Promise<ChatMessage[]> => {
    const messages = await invokeChat<NativeMessage[]>("chat_db_get_messages", {
        keyB64: chatKey,
        sessionUuid,
    });

    return messages.map((message) => ({
        messageUuid: message.messageUuid,
        sessionUuid: message.sessionUuid,
        parentMessageUuid: message.parentMessageUuid ?? undefined,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        attachments: message.attachments?.map((attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            name: attachment.name,
            size: attachment.size,
        })),
    }));
};

const createSessionNative = async (chatKey: string) => {
    const session = await invokeChat<NativeSession>("chat_db_create_session", {
        keyB64: chatKey,
        title: "New chat",
    });
    return session.sessionUuid;
};

const updateSessionTitleNative = async (
    chatKey: string,
    sessionUuid: string,
    title: string,
) => {
    await invokeChat("chat_db_update_session_title", {
        keyB64: chatKey,
        sessionUuid,
        title,
    });
};

const addMessageNative = async (
    sessionUuid: string,
    sender: "self" | "assistant",
    text: string,
    chatKey: string,
    parentMessageUuid?: string,
    attachments: ChatAttachment[] = [],
): Promise<ChatMessage> => {
    const message = await invokeChat<NativeMessage>("chat_db_insert_message", {
        keyB64: chatKey,
        input: {
            sessionUuid,
            sender,
            text,
            parentMessageUuid,
            attachments: attachments.map((attachment) => ({
                id: attachment.id,
                kind: attachment.kind,
                name: attachment.name,
                size: attachment.size,
            })),
        },
    });

    if (sender === "self") {
        try {
            const session = await invokeChat<NativeSession | null>(
                "chat_db_get_session",
                { keyB64: chatKey, sessionUuid },
            );
            if (
                session &&
                safeTitle(session.title).toLowerCase() === "new chat"
            ) {
                const title = sessionTitleFromText(text, "New chat");
                await updateSessionTitleNative(chatKey, sessionUuid, title);
            }
        } catch (error) {
            log.error("Failed to update native session title", error);
        }
    }

    return {
        messageUuid: message.messageUuid,
        sessionUuid: message.sessionUuid,
        parentMessageUuid: message.parentMessageUuid ?? undefined,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        attachments: message.attachments?.map((attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            name: attachment.name,
            size: attachment.size,
        })),
    };
};

const updateMessageNative = async (
    messageUuid: string,
    text: string,
    chatKey: string,
) => {
    await invokeChat("chat_db_update_message_text", {
        keyB64: chatKey,
        messageUuid,
        text,
    });
};

const deleteSessionNative = async (sessionUuid: string, chatKey: string) => {
    await invokeChat("chat_db_delete_session", {
        keyB64: chatKey,
        sessionUuid,
    });
};

export const listSessions = async (chatKey: string): Promise<ChatSession[]> => {
    if (isTauriRuntime()) {
        try {
            return await listSessionsNative(chatKey);
        } catch (error) {
            log.error(
                `Failed to list native sessions: ${formatLogError(error)}`,
            );
            throw error;
        }
    }

    try {
        const { sessions, messages } = await fetchStore();

        const activeSessions = sessions.sort(
            (a, b) => b.updatedAt - a.updatedAt,
        );

        const bySession = new Map<string, StoredMessage[]>();
        for (const message of messages) {
            const list = bySession.get(message.sessionUuid) ?? [];
            list.push(message);
            bySession.set(message.sessionUuid, list);
        }

        for (const list of bySession.values()) {
            list.sort((a, b) => b.createdAt - a.createdAt);
        }

        return Promise.all(
            activeSessions.map(async (session) => {
                const title = await decryptSessionTitle(session, chatKey);
                const latest = bySession.get(session.sessionUuid)?.[0];
                const lastMessagePreview = latest
                    ? await decryptMessageText(latest, chatKey)
                    : undefined;

                return {
                    sessionUuid: session.sessionUuid,
                    rootSessionUuid: session.sessionUuid,
                    branchFromMessageUuid: undefined,
                    title,
                    createdAt: session.createdAt,
                    updatedAt: session.updatedAt,
                    lastMessagePreview,
                } satisfies ChatSession;
            }),
        );
    } catch (error) {
        log.error(`Failed to list sessions: ${formatLogError(error)}`);
        throw error;
    }
};

export const listMessages = async (
    sessionUuid: string,
    chatKey: string,
): Promise<ChatMessage[]> => {
    if (isTauriRuntime()) {
        try {
            return await listMessagesNative(sessionUuid, chatKey);
        } catch (error) {
            log.error(
                `Failed to list native messages: ${formatLogError(error)}`,
            );
            throw error;
        }
    }

    try {
        const { messages } = await fetchStore();
        const sessionMessages = messages
            .filter((message) => message.sessionUuid === sessionUuid)
            .sort((a, b) => a.createdAt - b.createdAt);

        return Promise.all(
            sessionMessages.map(async (message) => ({
                messageUuid: message.messageUuid,
                sessionUuid: message.sessionUuid,
                parentMessageUuid: message.parentMessageUuid,
                sender: message.sender,
                createdAt: message.createdAt,
                text: await decryptMessageText(message, chatKey),
                attachments: await deserializeAttachments(
                    message.attachments,
                    chatKey,
                ),
            })),
        );
    } catch (error) {
        log.error(`Failed to list messages: ${formatLogError(error)}`);
        throw error;
    }
};

export const createSession = async (chatKey: string) => {
    if (isTauriRuntime()) {
        return createSessionNative(chatKey);
    }

    const db = await chatDb();
    const now = nowMicros();
    const sessionUuid = crypto.randomUUID();

    const encrypted = await encryptChatPayload({ title: "New chat" }, chatKey);

    const session: StoredSession = {
        sessionUuid,
        createdAt: now,
        updatedAt: now,
        encryptedData: encrypted.encryptedData,
        header: encrypted.header,
    };

    await db.put("sessions", session);
    return sessionUuid;
};

export const addMessage = async (
    sessionUuid: string,
    sender: "self" | "assistant",
    text: string,
    chatKey: string,
    parentMessageUuid?: string,
    attachments: ChatAttachment[] = [],
): Promise<ChatMessage> => {
    if (isTauriRuntime()) {
        return addMessageNative(
            sessionUuid,
            sender,
            text,
            chatKey,
            parentMessageUuid,
            attachments,
        );
    }

    const db = await chatDb();
    const now = nowMicros();
    const messageUuid = crypto.randomUUID();

    const encrypted = await encryptChatPayload({ text }, chatKey);
    const storedAttachments = await serializeAttachments(attachments, chatKey);

    const message: StoredMessage = {
        messageUuid,
        sessionUuid,
        parentMessageUuid,
        sender,
        createdAt: now,
        encryptedData: encrypted.encryptedData,
        header: encrypted.header,
        attachments: storedAttachments,
    };

    const tx = db.transaction(["sessions", "messages"], "readwrite");
    await tx.objectStore("messages").put(message);

    const sessionStore = tx.objectStore("sessions");
    const session = await sessionStore.get(sessionUuid);
    if (session) {
        session.updatedAt = now;

        const currentTitle = await decryptSessionTitle(session, chatKey);
        if (sender === "self" && currentTitle.toLowerCase() === "new chat") {
            const title = sessionTitleFromText(text, "New chat");
            const updated = await encryptChatPayload({ title }, chatKey);
            session.encryptedData = updated.encryptedData;
            session.header = updated.header;
        }

        await sessionStore.put(session);
    }

    await tx.done;
    return {
        messageUuid,
        sessionUuid,
        parentMessageUuid,
        sender,
        text,
        createdAt: now,
        attachments,
    };
};

export const updateSessionTitle = async (
    sessionUuid: string,
    title: string,
    chatKey: string,
) => {
    const safe = sessionTitleFromText(title, "New chat");
    if (isTauriRuntime()) {
        await updateSessionTitleNative(chatKey, sessionUuid, safe);
        return;
    }

    const db = await chatDb();
    const session = await db.get("sessions", sessionUuid);
    if (!session) return;

    const updated = await encryptChatPayload({ title: safe }, chatKey);
    session.encryptedData = updated.encryptedData;
    session.header = updated.header;
    session.updatedAt = nowMicros();
    await db.put("sessions", session);
};

export const updateMessage = async (
    messageUuid: string,
    text: string,
    chatKey: string,
) => {
    if (isTauriRuntime()) {
        await updateMessageNative(messageUuid, text, chatKey);
        return;
    }

    const db = await chatDb();
    const tx = db.transaction(["sessions", "messages"], "readwrite");
    const messageStore = tx.objectStore("messages");
    const message = await messageStore.get(messageUuid);
    if (!message) {
        await tx.done;
        return;
    }

    const encrypted = await encryptChatPayload({ text }, chatKey);
    message.encryptedData = encrypted.encryptedData;
    message.header = encrypted.header;
    await messageStore.put(message);

    const sessionStore = tx.objectStore("sessions");
    const session = await sessionStore.get(message.sessionUuid);
    if (session) {
        session.updatedAt = nowMicros();
        await sessionStore.put(session);
    }

    await tx.done;
};

const branchSelectionsKey = (rootSessionUuid: string) =>
    `ensu.chat.branchSelections.v1.${rootSessionUuid}`;

export const getBranchSelections = async (rootSessionUuid: string) => {
    const stored = await getKV(branchSelectionsKey(rootSessionUuid));
    if (!stored || typeof stored !== "object") return {};

    return Object.fromEntries(
        Object.entries(stored).filter(
            (entry): entry is [string, string] =>
                typeof entry[0] === "string" && typeof entry[1] === "string",
        ),
    );
};

export const setBranchSelection = async (
    rootSessionUuid: string,
    selectionKey: string,
    selectedMessageUuid: string,
) => {
    const selections = await getBranchSelections(rootSessionUuid);
    selections[selectionKey] = selectedMessageUuid;
    await setKV(branchSelectionsKey(rootSessionUuid), selections);
};

export const deleteBranchSelections = (rootSessionUuid: string) =>
    removeKV(branchSelectionsKey(rootSessionUuid));

export const deleteSession = async (sessionUuid: string, chatKey: string) => {
    if (isTauriRuntime()) {
        await deleteSessionNative(sessionUuid, chatKey);
        await deleteBranchSelections(sessionUuid);
        return;
    }

    const db = await chatDb();
    const messages = await db.getAll("messages");
    const tx = db.transaction(["sessions", "messages"], "readwrite");
    const sessionStore = tx.objectStore("sessions");
    const messageStore = tx.objectStore("messages");
    await Promise.all([
        sessionStore.delete(sessionUuid),
        ...messages
            .filter((message) => message.sessionUuid === sessionUuid)
            .map((message) => messageStore.delete(message.messageUuid)),
    ]);

    await tx.done;
    await deleteBranchSelections(sessionUuid);
};

let _attachmentDir: Promise<string> | undefined;

const attachmentDir = async () => {
    if (!isTauriRuntime()) {
        return "";
    }

    _attachmentDir ??= (async () => {
        const { appDataDir, join } = await import("@tauri-apps/api/path");
        const { mkdir } = await import("@tauri-apps/plugin-fs");
        const root = await appDataDir();
        const dir = await join(root, "ensu_llmchat_attachments_v2");
        await mkdir(dir, { recursive: true });
        return dir;
    })();

    return _attachmentDir;
};

const attachmentPath = async (id: string) => {
    const { join } = await import("@tauri-apps/api/path");
    const dir = await attachmentDir();
    return join(dir, id);
};

export const writeAttachmentBytes = async (
    id: string,
    data: Uint8Array<ArrayBuffer>,
) => {
    if (isTauriRuntime()) {
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const path = await attachmentPath(id);
        await writeFile(path, data);
        return;
    }

    const db = await chatDb();
    await db.put("attachmentBytes", { id, data });
};

export const storeEncryptedAttachmentBytes = async (
    id: string,
    data: Uint8Array,
    chatKey: string,
    sessionUuid: string,
) => {
    const encrypted = await encryptAttachmentBytes(data, chatKey, sessionUuid);
    await writeAttachmentBytes(id, encrypted);
};

export const readAttachmentBytes = async (
    id: string,
): Promise<Uint8Array<ArrayBuffer>> => {
    if (isTauriRuntime()) {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const path = await attachmentPath(id);
        return readFile(path);
    }

    const db = await chatDb();
    const entry = await db.get("attachmentBytes", id);
    if (!entry) {
        throw new Error(`Attachment bytes not found: ${id}`);
    }
    return entry.data instanceof Uint8Array
        ? entry.data
        : new Uint8Array(entry.data);
};

export const readDecryptedAttachmentBytes = async (
    id: string,
    chatKey: string,
    sessionUuid: string,
): Promise<Uint8Array<ArrayBuffer>> => {
    const encrypted = await readAttachmentBytes(id);
    return decryptAttachmentBytes(encrypted, chatKey, sessionUuid);
};

export const attachmentBytesExists = async (id: string): Promise<boolean> => {
    if (isTauriRuntime()) {
        const { exists } = await import("@tauri-apps/plugin-fs");
        const path = await attachmentPath(id);
        return exists(path);
    }

    const db = await chatDb();
    const entry = await db.get("attachmentBytes", id);
    return !!entry;
};
