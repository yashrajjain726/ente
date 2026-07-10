import { isTauriRuntime } from "@/services/tauri-runtime";
import { removeKV } from "ente-base/kv";
import {
    secureStorageDelete,
    secureStorageGet,
    secureStorageSet,
} from "../secure-storage";
import { ensureCryptoInit, enteWasm } from "../wasm";

const LOCAL_KEY = "ensu.chatKey.local";
const LOCAL_STORE = "ensu.chat.store.v1";
const MIGRATION_DONE = "ensu.chat.localMigration.v3";
const CURRENT_SECURE_KEY = "localChatKey.v2";
const V1_LOCAL_SECURE_KEY = "localChatKey";
const V1_ATTACHMENT_SECURE_KEY = "legacyAttachmentKey.v2";
const KEY_FILE = "chat-keys.json";

type NativeChatKeys = { localChatKey?: string };

let _localKey: string | undefined;
let _initPromise: Promise<void> | undefined;

const localGet = (key: string) =>
    typeof localStorage === "undefined"
        ? undefined
        : (localStorage.getItem(key) ?? undefined);

const keyFilePath = async () => {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    return join(await appDataDir(), KEY_FILE);
};

const readKeyFile = async (): Promise<NativeChatKeys> => {
    const [{ exists, readFile }, path] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        keyFilePath(),
    ]);
    if (!(await exists(path))) return {};
    try {
        const parsed = JSON.parse(
            new TextDecoder().decode(await readFile(path)),
        ) as NativeChatKeys;
        return typeof parsed.localChatKey === "string" ? parsed : {};
    } catch {
        return {};
    }
};

export const isLocalChatMigrationDone = () => localGet(MIGRATION_DONE) === "1";

export const initChatKeyStore = async () => {
    if (!isTauriRuntime()) return;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const current = await secureStorageGet(CURRENT_SECURE_KEY);
        if (isLocalChatMigrationDone()) {
            _localKey = current;
            return;
        }

        const [v1Local, file] = await Promise.all([
            secureStorageGet(V1_LOCAL_SECURE_KEY),
            readKeyFile(),
        ]);
        _localKey =
            current ?? localGet(LOCAL_KEY) ?? v1Local ?? file.localChatKey;
        if (_localKey && current !== _localKey) {
            await secureStorageSet(CURRENT_SECURE_KEY, _localKey);
        }
    })().catch((error: unknown) => {
        _initPromise = undefined;
        throw error;
    });
    return _initPromise;
};

export const cachedLocalChatKey = () =>
    isTauriRuntime() ? _localKey : localGet(LOCAL_KEY);

const persistLocalKey = async (key: string) => {
    if (isTauriRuntime()) {
        await secureStorageSet(CURRENT_SECURE_KEY, key);
        _localKey = key;
    } else {
        localStorage.setItem(LOCAL_KEY, key);
    }
};

const hasNativeChatStore = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("chat_db_has_existing_store");
};

export const getOrCreateLocalChatKey = async () => {
    await initChatKeyStore();
    const cached = cachedLocalChatKey();
    if (cached) return cached;
    if (
        localGet(LOCAL_STORE) ||
        (isTauriRuntime() && (await hasNativeChatStore()))
    ) {
        throw new Error("Existing chat data has no encryption key");
    }

    await ensureCryptoInit();
    const chatKey = await (await enteWasm()).crypto_generate_key();
    await persistLocalKey(chatKey);
    return chatKey;
};

const retiredUserID = () => {
    try {
        const user = JSON.parse(localStorage.getItem("user") ?? "null") as {
            id?: unknown;
        } | null;
        const id = user?.id;
        return typeof id === "number" ? id : undefined;
    } catch {
        return undefined;
    }
};

export const finalizeLocalChatMigration = async () => {
    if (!isTauriRuntime()) return;
    const userID = retiredUserID();

    // The target DB and attachments have already been verified at this point.
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("chat_db_cleanup_v1");
    localStorage.removeItem(LOCAL_STORE);
    const secureKeys = [
        V1_LOCAL_SECURE_KEY,
        V1_ATTACHMENT_SECURE_KEY,
        "masterKey",
        "remoteChatKey",
        ...(userID
            ? [`remoteChatKey.${userID}`, `remoteChatKey.v2.${userID}`]
            : []),
    ];
    await Promise.all(secureKeys.map(secureStorageDelete));

    const [{ exists, remove }, { appDataDir, join }] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        import("@tauri-apps/api/path"),
    ]);
    const root = await appDataDir();
    const keyFile = await join(root, KEY_FILE);
    const syncMeta = await join(root, "sync_meta");
    if (await exists(keyFile)) await remove(keyFile);
    if (await exists(syncMeta)) await remove(syncMeta, { recursive: true });

    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("ensu.chatKey")) localStorage.removeItem(key);
    }
    [
        "user",
        "srpAttributes",
        "keyAttributes",
        "originalKeyAttributes",
        "isFirstLogin",
        "ensu.chat.nativeMigration.v2",
    ].forEach((key) => localStorage.removeItem(key));
    await removeKV("token");
    localStorage.setItem(MIGRATION_DONE, "1");
};
