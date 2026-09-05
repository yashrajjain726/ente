import { readAndFree } from "ente-utils/wasm";
import type { SrpSession } from "./pkg/ente_prelogin_wasm";

export type EncryptedBoxB64 = Awaited<ReturnType<typeof encryptBox>>;
export type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

const wasm = () => import("./pkg/ente_prelogin_wasm");

type BytesOrB64 = Uint8Array | string;

export interface DerivedKey {
    key: string;
    salt: string;
    opsLimit: number;
    memLimit: number;
}

interface EncryptedBox {
    encryptedData: BytesOrB64;
    nonce: BytesOrB64;
}

interface SRPSetupAttributes {
    srpSalt: string;
    srpVerifier: string;
    loginSubKey: string;
}

export const deriveKey = async (
    password: string,
    saltB64: string,
    opsLimit: number,
    memLimit: number,
) => (await wasm()).authDeriveKek(password, saltB64, memLimit, opsLimit);

export const deriveSensitiveKey = async (
    password: string,
): Promise<DerivedKey> =>
    readAndFree(
        (await wasm()).authGenerateSensitiveKek(password),
        derivedKeyValue,
    );

export const deriveInteractiveKey = async (
    password: string,
): Promise<DerivedKey> =>
    readAndFree(
        (await wasm()).authGenerateInteractiveKek(password),
        derivedKeyValue,
    );

export const generateSRPSetup = async (
    kekB64: string,
    srpUserID: string,
): Promise<SRPSetupAttributes> =>
    readAndFree(
        (await wasm()).authGenerateSrpSetup(kekB64, srpUserID),
        (setup) => ({
            srpSalt: setup.srpSalt,
            srpVerifier: setup.srpVerifier,
            loginSubKey: setup.loginSubKey,
        }),
    );

export const recoveryKeyFromMnemonicOrHex = async (value: string) =>
    (await wasm()).authRecoveryKeyFromMnemonicOrHex(value);

export const recoveryKeyToMnemonic = async (recoveryKeyB64: string) =>
    (await wasm()).authRecoveryKeyToMnemonic(recoveryKeyB64);

export const createSRPSession = async (
    srpSaltB64: string,
    srpUserID: string,
    loginKeyB64: string,
): Promise<SrpSession> =>
    new (await wasm()).SrpSession(srpUserID, srpSaltB64, loginKeyB64);

export const generateKey = async () => (await wasm()).cryptoGenerateKey();

export const generateKeyPair = async () =>
    readAndFree((await wasm()).cryptoGenerateKeyPair(), (keyPair) => ({
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
    }));

export const encryptBox = async (dataB64: string, keyB64: string) =>
    readAndFree((await wasm()).cryptoEncryptBox(dataB64, keyB64), (box) => ({
        encryptedData: box.encryptedData,
        nonce: box.nonce,
    }));

export const decryptBox = async (
    box: EncryptedBox,
    key: Uint8Array | string,
): Promise<string> =>
    (await wasm()).cryptoDecryptBox(
        toB64String(box.encryptedData),
        toB64String(box.nonce),
        toB64String(key),
    );

export const boxSealOpen = async (
    encryptedData: string,
    keyPair: KeyPair,
): Promise<string> =>
    (await wasm()).cryptoBoxSealOpen(
        encryptedData,
        keyPair.publicKey,
        keyPair.privateKey,
    );

export const boxSealOpenBytes = async (
    encryptedData: string,
    keyPair: KeyPair,
): Promise<Uint8Array<ArrayBuffer>> =>
    fromB64String(await boxSealOpen(encryptedData, keyPair));

export const deriveSubKeyBytes = async (
    keyB64: string,
    subKeyLength: number,
    subKeyID: number,
    context: string,
): Promise<Uint8Array<ArrayBuffer>> =>
    fromB64String(
        (await wasm()).cryptoDeriveSubKey(
            keyB64,
            subKeyLength,
            BigInt(subKeyID),
            context,
        ),
    );

const derivedKeyValue = (key: DerivedKey): DerivedKey => ({
    key: key.key,
    salt: key.salt,
    opsLimit: key.opsLimit,
    memLimit: key.memLimit,
});

const toB64String = (value: Uint8Array | string): string => {
    if (typeof value == "string") return value;
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const fromB64String = (value: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};
