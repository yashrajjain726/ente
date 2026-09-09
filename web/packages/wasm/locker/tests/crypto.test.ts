import { expect, test } from "vitest";
import {
    b64ToBytes,
    createStreamEncryptor,
    decryptMetadataJSON,
} from "../index";
import { cryptoDecryptBlob } from "../pkg/ente_locker_wasm.js";

test("metadata wrapper reads legacy JSON after a stream_truncated error", async () => {
    const metadata = { title: "Zoë 🦋" };
    const encryptor = await createStreamEncryptor();

    try {
        const encryptedData = encryptor.encryptChunk(
            new TextEncoder().encode(JSON.stringify(metadata)),
            false,
        );
        const { key, decryptionHeader } = encryptor;

        expect(() =>
            cryptoDecryptBlob(
                Buffer.from(encryptedData).toString("base64"),
                decryptionHeader,
                key,
            ),
        ).toThrow(expect.objectContaining({ name: "stream_truncated" }));

        expect(
            await decryptMetadataJSON(
                { encryptedData, decryptionHeader },
                b64ToBytes(key),
            ),
        ).toStrictEqual(metadata);
    } finally {
        encryptor.free();
    }
});
