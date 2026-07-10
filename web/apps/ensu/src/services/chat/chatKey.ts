import { isTauriRuntime } from "@/services/tauri-runtime";
import log from "ente-base/log";
import {
    secureStorageDelete,
    secureStorageGet,
    secureStorageSet,
} from "../secure-storage";
import { ensureCryptoInit, enteWasm } from "../wasm";

const LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY = "ensu.chatKey.local";
const CHAT_KEY_FILE_NAME = "chat-keys.json";
const LOCAL_CHAT_KEY_SECURE_STORAGE_KEY = "localChatKey.v2";
const V1_ATTACHMENT_KEY_SECURE_STORAGE_KEY = "legacyAttachmentKey.v2";
const V1_LOCAL_CHAT_KEY_SECURE_STORAGE_KEY = "localChatKey";

type NativeChatKeys = { localChatKey?: string };

let _localChatKey: string | undefined;
let _v1LocalChatKey: string | undefined;
let _v1AttachmentChatKey: string | undefined;
let _v1ChatKeyCandidates: string[] = [];
let _chatKeyStoreInitPromise: Promise<void> | undefined;

const readLocalStorageKey = (key: string) => {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage.getItem(key) ?? undefined;
};

const writeLocalStorageKey = (key: string, value: string) => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
};

const removeLocalStorageKey = (key: string) => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
};

const nativeChatKeyPath = async () => {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const root = await appDataDir();
    return join(root, CHAT_KEY_FILE_NAME);
};

const readNativeChatKeys = async (): Promise<NativeChatKeys> => {
    if (!isTauriRuntime()) return {};

    const [{ exists, readFile }, path] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        nativeChatKeyPath(),
    ]);

    if (!(await exists(path))) return {};

    try {
        const raw = new TextDecoder().decode(await readFile(path));
        const parsed = JSON.parse(raw) as NativeChatKeys;
        return {
            localChatKey:
                typeof parsed.localChatKey === "string"
                    ? parsed.localChatKey
                    : undefined,
        };
    } catch {
        return {};
    }
};

const persistNativeChatKeys = async () => {
    if (!isTauriRuntime()) return;

    const operations: Promise<void>[] = [];
    if (_localChatKey) {
        operations.push(
            secureStorageSet(LOCAL_CHAT_KEY_SECURE_STORAGE_KEY, _localChatKey),
        );
    } else {
        operations.push(secureStorageDelete(LOCAL_CHAT_KEY_SECURE_STORAGE_KEY));
    }

    await Promise.all(operations);
};

const persistNativeChatKeysSoon = () => {
    persistNativeChatKeys().catch(() => {
        // Best effort cache persistence.
    });
};

const cleanupV1ChatKeyCopies = async () => {
    removeLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY);

    try {
        const { remove } = await import("@tauri-apps/plugin-fs");
        const path = await nativeChatKeyPath();
        await remove(path);
    } catch {
        // The v1 key file may not exist.
    }
};

export const initChatKeyStore = async () => {
    if (!isTauriRuntime()) return;

    if (_chatKeyStoreInitPromise) return _chatKeyStoreInitPromise;

    _chatKeyStoreInitPromise = (async () => {
        const [
            secureLocalChatKey,
            secureV1AttachmentKey,
            secureV1LocalChatKey,
            nativeKeys,
        ] = await Promise.all([
            secureStorageGet(LOCAL_CHAT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            secureStorageGet(V1_ATTACHMENT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            secureStorageGet(V1_LOCAL_CHAT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            readNativeChatKeys(),
        ]);
        // Prefer localStorage over v1 secure storage for the local key.
        // Pre-v0.1.12 builds only used localStorage, so when both exist the
        // localStorage value is the key that actually encrypted the v1 DB.
        // Stale OS keyring entries from a previous v0.1.12 install can shadow
        // the correct localStorage key if secure storage is checked first.
        const v1LocalChatKey =
            readLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY) ??
            secureV1LocalChatKey ??
            nativeKeys.localChatKey;
        const localChatKey = secureLocalChatKey ?? v1LocalChatKey;

        _localChatKey = localChatKey;
        _v1LocalChatKey = v1LocalChatKey;
        _v1AttachmentChatKey = secureV1AttachmentKey;

        // Capture v1 candidates before cleanup removes their old copies.
        {
            const rawLocalStorage = readLocalStorageKey(
                LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY,
            );
            const seen = new Set<string>();
            const all: string[] = [];
            for (const k of [
                secureLocalChatKey,
                secureV1LocalChatKey,
                nativeKeys.localChatKey,
                rawLocalStorage,
            ]) {
                if (k && !seen.has(k)) {
                    seen.add(k);
                    all.push(k);
                }
            }
            _v1ChatKeyCandidates = all;
        }

        if (secureLocalChatKey !== localChatKey) {
            try {
                await persistNativeChatKeys();
            } catch (error) {
                log.warn(
                    "Failed to persist chat keys to secure storage; continuing with in-memory keys",
                    error,
                );
                return;
            }
        }

        try {
            await cleanupV1ChatKeyCopies();
        } catch (error) {
            log.warn("Failed to clean up v1 chat key copies", error);
        }
    })().catch((error: unknown) => {
        _chatKeyStoreInitPromise = undefined;
        throw error;
    });

    return _chatKeyStoreInitPromise;
};

const setCachedChatKey = (chatKey: string) => {
    if (isTauriRuntime()) {
        _localChatKey = chatKey;
        persistNativeChatKeysSoon();
        return;
    }

    writeLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY, chatKey);
};

/**
 * Return the cached local-only chat key (base64), if present.
 */
export const cachedLocalChatKey = (): string | undefined => {
    if (isTauriRuntime()) {
        return _localChatKey;
    }

    return readLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY);
};

export const v1LocalChatKey = (): string | undefined => {
    if (isTauriRuntime()) {
        return _v1LocalChatKey;
    }

    return readLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY);
};

/**
 * Return every key candidate that might decrypt the v1 DB.
 */
export const v1ChatKeyCandidates = (): string[] => {
    const seen = new Set<string>();
    const keys: string[] = [];
    const add = (k: string | undefined) => {
        if (k && !seen.has(k)) {
            seen.add(k);
            keys.push(k);
        }
    };
    add(_v1LocalChatKey);
    add(_localChatKey);
    for (const k of _v1ChatKeyCandidates) add(k);
    return keys;
};

export const v1AttachmentChatKey = (): string | undefined =>
    _v1AttachmentChatKey;

export const setV1AttachmentChatKey = async (chatKey?: string) => {
    _v1AttachmentChatKey = chatKey;
    if (!isTauriRuntime()) return;
    if (chatKey) {
        await secureStorageSet(V1_ATTACHMENT_KEY_SECURE_STORAGE_KEY, chatKey);
    } else {
        await secureStorageDelete(V1_ATTACHMENT_KEY_SECURE_STORAGE_KEY);
    }
};

/**
 * Get or create the local-only chat encryption key.
 */
export const getOrCreateLocalChatKey = async () => {
    await initChatKeyStore();
    const cached = cachedLocalChatKey();
    if (cached) return cached;

    await ensureCryptoInit();
    const wasm = await enteWasm();
    const chatKey = await wasm.crypto_generate_key();
    setCachedChatKey(chatKey);
    return chatKey;
};
