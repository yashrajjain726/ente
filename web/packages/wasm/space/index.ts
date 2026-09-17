import type {
    OpenAccountSpaceCtxJsInput,
    OpenSpaceLinkCtxJsInput,
} from "./pkg/ente_space_wasm";

const wasm = () => import("./pkg/ente_space_wasm");

export type { DecryptedSpaceProfile } from "./pkg/ente_space_wasm";

export type SpaceAccountCtxHandle =
    import("./pkg/ente_space_wasm").SpaceAccountCtxHandle;
export type SpaceLinkCtxHandle =
    import("./pkg/ente_space_wasm").SpaceLinkCtxHandle;

export const encryptSpaceRootEntityKey = async (
    spaceRootKeyB64: string,
    masterKeyB64: string,
) => (await wasm()).encryptSpaceRootEntityKey(spaceRootKeyB64, masterKeyB64);

export const decryptSpaceRootEntityKey = async (
    encryptedKeyB64: string,
    masterKeyB64: string,
) => (await wasm()).decryptSpaceRootEntityKey(encryptedKeyB64, masterKeyB64);

export const openSpaceAccountContext = async (
    input: OpenAccountSpaceCtxJsInput,
): Promise<SpaceAccountCtxHandle> => (await wasm()).spaceOpenAccountCtx(input);

export const openSpaceLinkContext = async (
    input: OpenSpaceLinkCtxJsInput,
): Promise<SpaceLinkCtxHandle> => (await wasm()).spaceOpenLinkCtx(input);
