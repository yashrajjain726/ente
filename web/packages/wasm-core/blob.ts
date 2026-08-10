import { loadWasmCore } from "./load";
import { Header, Key } from "./types";

export interface EncryptedBlob {
    encryptedData: Uint8Array;
    decryptionHeader: Header;
}

export const blobEncrypt = async (
    data: Uint8Array,
    key: Key,
): Promise<EncryptedBlob> => {
    const wasm = await loadWasmCore();
    const blob = wasm.blobEncrypt(data, key.bytes);
    try {
        return {
            encryptedData: blob.encryptedData,
            decryptionHeader: Header.fromBytes(blob.decryptionHeader),
        };
    } finally {
        blob.free();
    }
};

export const blobDecrypt = async (
    data: Uint8Array,
    header: Header,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.blobDecrypt(data, header.bytes, key.bytes);
};

export const blobEncryptCombined = async (
    data: Uint8Array,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.blobEncryptCombined(data, key.bytes);
};

export const blobDecryptCombined = async (
    data: Uint8Array,
    key: Key,
): Promise<Uint8Array> => {
    const wasm = await loadWasmCore();
    return wasm.blobDecryptCombined(data, key.bytes);
};
