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
const LEGACY_ATTACHMENT_KEY_SECURE_STORAGE_KEY = "legacyAttachmentKey.v2";
const LEGACY_LOCAL_CHAT_KEY_SECURE_STORAGE_KEY = "localChatKey";

type NativeChatKeys = { localChatKey?: string };

let _localChatKey: string | undefined;
let _legacyLocalChatKey: string | undefined;
let _legacyAttachmentChatKey: string | undefined;
/** All distinct keys discovered during init, before any cleanup. */
let _allDiscoveredLocalChatKeys: string[] = [];
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

const cleanupLegacyChatKeyCopies = async () => {
    removeLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY);

    try {
        const { remove } = await import("@tauri-apps/plugin-fs");
        const path = await nativeChatKeyPath();
        await remove(path);
    } catch {
        // ignore missing legacy file
    }
};

export const initChatKeyStore = async () => {
    if (!isTauriRuntime()) return;

    if (_chatKeyStoreInitPromise) return _chatKeyStoreInitPromise;

    _chatKeyStoreInitPromise = (async () => {
        const [
            secureLocalChatKey,
            secureLegacyAttachmentKey,
            legacySecureLocalChatKey,
            nativeKeys,
        ] = await Promise.all([
            secureStorageGet(LOCAL_CHAT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            secureStorageGet(LEGACY_ATTACHMENT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            secureStorageGet(LEGACY_LOCAL_CHAT_KEY_SECURE_STORAGE_KEY).catch(
                () => undefined,
            ),
            readNativeChatKeys(),
        ]);
        // Prefer localStorage over legacy secure storage for the local key.
        // Pre-v0.1.12 builds only used localStorage, so when both exist the
        // localStorage value is the key that actually encrypted the legacy DB.
        // Stale OS keyring entries from a previous v0.1.12 install can shadow
        // the correct localStorage key if secure storage is checked first.
        const legacyLocalChatKey =
            readLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY) ??
            legacySecureLocalChatKey ??
            nativeKeys.localChatKey;
        const localChatKey = secureLocalChatKey ?? legacyLocalChatKey;

        _localChatKey = localChatKey;
        _legacyLocalChatKey = legacyLocalChatKey;
        _legacyAttachmentChatKey = secureLegacyAttachmentKey;

        // Capture every distinct local chat key found across all sources
        // *before* cleanup deletes legacy copies. The migration needs all
        // of these because the ?? chains above can shadow the correct key
        // when stale entries exist in the OS keyring.
        {
            const rawLocalStorage = readLocalStorageKey(
                LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY,
            );
            const seen = new Set<string>();
            const all: string[] = [];
            for (const k of [
                secureLocalChatKey,
                legacySecureLocalChatKey,
                nativeKeys.localChatKey,
                rawLocalStorage,
            ]) {
                if (k && !seen.has(k)) {
                    seen.add(k);
                    all.push(k);
                }
            }
            _allDiscoveredLocalChatKeys = all;
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
            await cleanupLegacyChatKeyCopies();
        } catch (error) {
            log.warn("Failed to clean up legacy chat key copies", error);
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

export const legacyLocalChatKey = (): string | undefined => {
    if (isTauriRuntime()) {
        return _legacyLocalChatKey;
    }

    return readLocalStorageKey(LOCAL_CHAT_KEY_LOCAL_STORAGE_KEY);
};

/**
 * Return all distinct legacy key candidates that might decrypt a legacy DB.
 *
 * Unlike {@link legacyLocalChatKey}, this returns every key found across all
 * legacy storage locations so the migration can try each one. This is needed
 * because stale keys in the OS keyring can shadow the correct key in
 * localStorage.
 */
export const allLegacyKeyCandidates = (): string[] => {
    const seen = new Set<string>();
    const keys: string[] = [];
    const add = (k: string | undefined) => {
        if (k && !seen.has(k)) {
            seen.add(k);
            keys.push(k);
        }
    };
    add(_legacyLocalChatKey);
    add(_localChatKey);
    // Include every local chat key discovered during init (before cleanup
    // deleted legacy copies). This ensures we try the raw localStorage key
    // even when stale OS keyring entries shadowed it in the ?? chains.
    for (const k of _allDiscoveredLocalChatKeys) add(k);
    return keys;
};

export const legacyAttachmentChatKey = (): string | undefined =>
    _legacyAttachmentChatKey;

export const setLegacyAttachmentChatKey = async (chatKey?: string) => {
    _legacyAttachmentChatKey = chatKey;
    if (!isTauriRuntime()) return;
    if (chatKey) {
        await secureStorageSet(
            LEGACY_ATTACHMENT_KEY_SECURE_STORAGE_KEY,
            chatKey,
        );
    } else {
        await secureStorageDelete(LEGACY_ATTACHMENT_KEY_SECURE_STORAGE_KEY);
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
