import type {
    OpenAccountSpaceCtxInput,
    OpenSpaceLinkCtxInput,
    SpaceAccountCtxHandle,
    SpaceLinkCtxHandle,
} from "./pkg/ente_space_wasm";

export type {
    DecryptedSpaceProfile,
    MessageConversationActivity,
    MessageResponse,
    PostObjectPayload,
    PostPage,
    PostResponse,
    ProfileAvatarResponse,
    SpaceAccountCtxHandle,
    SpaceActorResponse,
    SpaceKeyResponse,
    SpaceLinkCtxHandle,
    UpdateSpaceProfileResponse,
} from "./pkg/ente_space_wasm";

const wasm = () => import("./pkg/ente_space_wasm");

export const encryptSpaceRootEntityKey = async (
    spaceRootKeyB64: string,
    masterKeyB64: string,
) => (await wasm()).encryptSpaceRootEntityKey(spaceRootKeyB64, masterKeyB64);

export const decryptSpaceRootEntityKey = async (
    encryptedKeyB64: string,
    masterKeyB64: string,
) => (await wasm()).decryptSpaceRootEntityKey(encryptedKeyB64, masterKeyB64);

export const openSpaceAccountContext = async (
    input: OpenAccountSpaceCtxInput,
): Promise<SpaceAccountCtxHandle> => (await wasm()).spaceOpenAccountCtx(input);

export const openSpaceLinkContext = async (
    input: OpenSpaceLinkCtxInput,
): Promise<SpaceLinkCtxHandle> => (await wasm()).spaceOpenLinkCtx(input);
