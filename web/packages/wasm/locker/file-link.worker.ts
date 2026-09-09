import { expose } from "comlink";
import { readAndFree } from "ente-utils/wasm";

export class FileLinkWorker {
    async prepareFileLinkPayload(fileKeyB64: string) {
        const wasm = await import("./pkg/ente_locker_wasm");
        return readAndFree(
            wasm.lockerPrepareFileLinkPayload(fileKeyB64),
            (payload) => ({
                fragment: payload.fragment,
                encryptedFileKey: payload.encryptedFileKey,
                encryptedFileKeyNonce: payload.encryptedFileKeyNonce,
                kdfNonce: payload.kdfNonce,
                kdfMemLimit: payload.kdfMemLimit,
                kdfOpsLimit: payload.kdfOpsLimit,
            }),
        );
    }
}

expose(FileLinkWorker);
