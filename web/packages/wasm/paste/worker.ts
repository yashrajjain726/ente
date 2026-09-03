import { expose } from "comlink";
import { readAndFree } from "ente-utils/wasm";
import type { PasteClient as WasmPasteClient } from "./pkg/ente_paste_wasm";

export class PasteWorker {
    private client: Promise<WasmPasteClient>;

    constructor(apiOrigin: string) {
        this.client = import("./pkg/ente_paste_wasm").then(
            ({ PasteClient }) => new PasteClient(apiOrigin),
        );
    }

    async create(pasteOrigin: string, text: string, password?: string) {
        return readAndFree(
            await (await this.client).create(pasteOrigin, text, password),
            (paste) => ({
                url: paste.url,
                passwordRequired: paste.passwordRequired,
            }),
        );
    }

    async open(url: string) {
        return readAndFree(await (await this.client).open(url), (paste) =>
            paste.passwordRequired
                ? { passwordRequired: true as const }
                : { passwordRequired: false as const, text: paste.text! },
        );
    }

    submitPassword = async (password: string) =>
        (await this.client).submitPassword(password);
}

expose(PasteWorker);
