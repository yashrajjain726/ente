import { expose } from "comlink";
import { readAndFree } from "ente-utils/wasm";

export class KDFWorker {
    async deriveInteractiveKey(password: string) {
        const wasm = await import("./pkg/ente_locker_wasm");
        return readAndFree(
            wasm.authGenerateInteractiveKek(password),
            (key) => ({
                key: key.key,
                salt: key.salt,
                opsLimit: key.opsLimit,
                memLimit: key.memLimit,
            }),
        );
    }
}

expose(KDFWorker);
