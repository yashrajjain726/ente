import { removeKV } from "ente-base/kv";
import {
    secureStorageDelete,
    secureStorageGet,
    secureStorageSet,
} from "../secure-storage";

const LOCAL_STORE = "ensu.chat.store.v1";
const MIGRATION_DONE = "ensu.chat.localMigration.v3";
const OLD_LOCAL_SECURE_KEY = "localChatKey";
const OLD_ATTACHMENT_SECURE_KEY = "legacyAttachmentKey.v2";
const KEY_FILE = "chat-keys.json";

const localGet = (key: string) => localStorage.getItem(key) ?? undefined;

const keyFilePath = async () => {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    return join(await appDataDir(), KEY_FILE);
};

const readKeyFile = async () => {
    const [{ exists, readFile }, path] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        keyFilePath(),
    ]);
    if (!(await exists(path))) return undefined;
    try {
        const value = JSON.parse(
            new TextDecoder().decode(await readFile(path)),
        ) as { localChatKey?: unknown };
        return typeof value.localChatKey === "string"
            ? value.localChatKey
            : undefined;
    } catch {
        return undefined;
    }
};

export const isLocalChatMigrationDone = () => localGet(MIGRATION_DONE) === "1";

export const promoteLocalChatKey = async (
    current: string | undefined,
    currentSecureKey: string,
    browserKey: string,
) => {
    if (isLocalChatMigrationDone()) return current;
    const [oldSecure, file] = await Promise.all([
        secureStorageGet(OLD_LOCAL_SECURE_KEY),
        readKeyFile(),
    ]);
    const key = current ?? localGet(browserKey) ?? oldSecure ?? file;
    if (key && key !== current) await secureStorageSet(currentSecureKey, key);
    return key;
};

export const hasRetiredLocalChatStore = () => !!localGet(LOCAL_STORE);

const retiredUserID = () => {
    try {
        const user = JSON.parse(localStorage.getItem("user") ?? "null") as {
            id?: unknown;
        } | null;
        return typeof user?.id === "number" ? user.id : undefined;
    } catch {
        return undefined;
    }
};

export const finalizeLocalChatMigration = async () => {
    const userID = retiredUserID();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("chat_db_cleanup_v1");
    localStorage.removeItem(LOCAL_STORE);
    await Promise.all(
        [
            OLD_LOCAL_SECURE_KEY,
            OLD_ATTACHMENT_SECURE_KEY,
            "masterKey",
            "remoteChatKey",
            ...(userID
                ? [`remoteChatKey.${userID}`, `remoteChatKey.v2.${userID}`]
                : []),
        ].map(secureStorageDelete),
    );

    const [{ exists, remove }, { appDataDir, join }] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        import("@tauri-apps/api/path"),
    ]);
    const root = await appDataDir();
    const keyFile = await join(root, KEY_FILE);
    if (await exists(keyFile)) await remove(keyFile);

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
