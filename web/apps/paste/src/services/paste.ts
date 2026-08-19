import { apiOrigin } from "ente-base/origins";
import { PasteClient } from "ente-paste-wasm";

let client: Promise<PasteClient> | undefined;

export const pasteClient = () =>
    (client ??= apiOrigin().then((origin) => PasteClient.init(origin)));
