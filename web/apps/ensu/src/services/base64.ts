export const bytesToBase64 = (bytes: Uint8Array): string => {
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        for (const value of chunk) {
            binary += String.fromCharCode(value);
        }
    }
    return btoa(binary);
};

export const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

export const utf8ToBase64 = (s: string): string =>
    bytesToBase64(new TextEncoder().encode(s));

export const base64ToUtf8 = (b64: string): string =>
    new TextDecoder().decode(base64ToBytes(b64));
