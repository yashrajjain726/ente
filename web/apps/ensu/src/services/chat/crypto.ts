import { base64ToBytes, bytesToBase64 } from "@/services/base64";
import { isTauriRuntime } from "@/services/tauri-runtime";

type EnsuWasmModule = typeof import("ente-ensu-wasm");

export interface EncryptedChatPayload {
    encryptedData: string;
    header: string;
}

const ensuWasm = () => import("ente-ensu-wasm");

const tauriInvoke = async <T>(
    command: string,
    args?: Record<string, unknown>,
) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
};

const encryptedChatPayloadValue = (
    payload: ReturnType<EnsuWasmModule["encryptChatPayload"]>,
) => {
    try {
        return { encryptedData: payload.encryptedData, header: payload.header };
    } finally {
        payload.free();
    }
};

const wasmBytes = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

export const generateChatKey = async () =>
    isTauriRuntime()
        ? tauriInvoke<string>("chat_crypto_generate_key")
        : (await ensuWasm()).generateChatKey();

export const encryptChatPayload = async (
    payload: unknown,
    chatKeyB64: string,
): Promise<EncryptedChatPayload> => {
    const value = JSON.stringify(payload);
    if (isTauriRuntime()) {
        return tauriInvoke("chat_crypto_encrypt_payload", {
            input: { value, keyB64: chatKeyB64 },
        });
    }
    return encryptedChatPayloadValue(
        (await ensuWasm()).encryptChatPayload(value, chatKeyB64),
    );
};

export const decryptChatPayload = async (
    { encryptedData, header }: EncryptedChatPayload,
    chatKeyB64: string,
): Promise<unknown> => {
    const value = isTauriRuntime()
        ? await tauriInvoke<string>("chat_crypto_decrypt_payload", {
              input: {
                  encryptedDataB64: encryptedData,
                  headerB64: header,
                  keyB64: chatKeyB64,
              },
          })
        : (await ensuWasm()).decryptChatPayload(
              encryptedData,
              header,
              chatKeyB64,
          );
    return JSON.parse(value);
};

export const encryptChatField = async (
    value: string,
    chatKeyB64: string,
): Promise<string> =>
    isTauriRuntime()
        ? tauriInvoke("chat_crypto_encrypt_field", {
              input: { value, keyB64: chatKeyB64 },
          })
        : (await ensuWasm()).encryptChatField(value, chatKeyB64);

export const decryptChatField = async (
    value: string,
    chatKeyB64: string,
): Promise<string> =>
    isTauriRuntime()
        ? tauriInvoke("chat_crypto_decrypt_field", {
              input: { value, keyB64: chatKeyB64 },
          })
        : (await ensuWasm()).decryptChatField(value, chatKeyB64);

export const encryptAttachmentBytes = async (
    data: Uint8Array,
    chatKeyB64: string,
    sessionUuid: string,
): Promise<Uint8Array<ArrayBuffer>> =>
    isTauriRuntime()
        ? base64ToBytes(
              await tauriInvoke<string>("chat_crypto_encrypt_attachment", {
                  input: {
                      dataB64: bytesToBase64(data),
                      keyB64: chatKeyB64,
                      sessionUuid,
                  },
              }),
          )
        : wasmBytes(
              (await ensuWasm()).encryptChatAttachment(
                  data,
                  chatKeyB64,
                  sessionUuid,
              ),
          );

export const decryptAttachmentBytes = async (
    data: Uint8Array,
    chatKeyB64: string,
    sessionUuid: string,
): Promise<Uint8Array<ArrayBuffer>> =>
    isTauriRuntime()
        ? base64ToBytes(
              await tauriInvoke<string>("chat_crypto_decrypt_attachment", {
                  input: {
                      dataB64: bytesToBase64(data),
                      keyB64: chatKeyB64,
                      sessionUuid,
                  },
              }),
          )
        : wasmBytes(
              (await ensuWasm()).decryptChatAttachment(
                  data,
                  chatKeyB64,
                  sessionUuid,
              ),
          );
