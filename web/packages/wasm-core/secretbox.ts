import { loadWasmCore } from "./load";
import { Key, Nonce } from "./types";

export interface EncryptedBox {
    encryptedData: Uint8Array;
    nonce: Nonce;
}

export const secretboxEncrypt = async (
    data: Uint8Array,
    key: Key,
): Promise<EncryptedBox> => {
    const wasm = await loadWasmCore();
    const box = wasm.secretboxEncrypt(data, key.bytes);
    try {
        return {
            encryptedData: box.encryptedData,
            nonce: Nonce.fromBytes(box.nonce),
        };
    } finally {
        box.free();
    }
};

export const secretboxDecrypt = async (
    data: Uint8Array,
    nonce: Nonce,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.secretboxDecrypt(data, nonce.bytes, key.bytes);
};

export const secretboxEncryptCombined = async (
    data: Uint8Array,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.secretboxEncryptCombined(data, key.bytes);
};

export const secretboxDecryptCombined = async (
    data: Uint8Array,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.secretboxDecryptCombined(data, key.bytes);
};
