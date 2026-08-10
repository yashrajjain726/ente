import * as bip39 from "bip39";
import { savedKeyAttributes } from "ente-accounts/services/accounts-db";
import {
    decryptBox,
    encryptBox,
    fromHex,
    generateKey,
    toHex,
} from "ente-base/crypto";
import { ensureMasterKeyFromSession } from "ente-base/session";
import { saveKeyAttributes } from "./accounts-db";
import { putUserRecoveryKeyAttributes, type KeyAttributes } from "./user";

// The wordlist must stay English since the BIP-39 library used by the mobile
// clients only supports English.
bip39.setDefaultWordlist("english");

// For legacy compatibility, the hex representation of the recovery key is
// accepted in addition to the 24 word BIP-39 mnemonic.
export const recoveryKeyFromMnemonic = (recoveryKeyMnemonicOrHex: string) => {
    const trimmedInput = recoveryKeyMnemonicOrHex
        .trim()
        .split(" ")
        .map((part) => part.trim())
        .filter((part) => !!part)
        .join(" ");

    let recoveryKeyHex: string;
    if (trimmedInput.indexOf(" ") > 0) {
        if (trimmedInput.split(" ").length != 24) {
            throw new Error("recovery code should have 24 words");
        }
        recoveryKeyHex = bip39.mnemonicToEntropy(trimmedInput);
    } else {
        recoveryKeyHex = trimmedInput;
    }

    return fromHex(recoveryKeyHex);
};

export const recoveryKeyToMnemonic = async (recoveryKey: string) =>
    bip39.entropyToMnemonic(await toHex(recoveryKey));

export const getUserRecoveryKey = async () => {
    const masterKey = await ensureMasterKeyFromSession();

    const keyAttributes = savedKeyAttributes()!;
    const { recoveryKeyEncryptedWithMasterKey, recoveryKeyDecryptionNonce } =
        keyAttributes;

    if (recoveryKeyEncryptedWithMasterKey && recoveryKeyDecryptionNonce) {
        return decryptBox(
            {
                encryptedData: recoveryKeyEncryptedWithMasterKey,
                nonce: recoveryKeyDecryptionNonce,
            },
            masterKey,
        );
    } else {
        return createNewRecoveryKey(masterKey, keyAttributes);
    }
};

// Very old accounts did not get a recovery key at sign up; for them one is
// generated lazily when it is first needed.
const createNewRecoveryKey = async (
    masterKey: string,
    existingKeyAttributes: KeyAttributes,
) => {
    const recoveryKey = await generateKey();
    const encryptedMasterKey = await encryptBox(masterKey, recoveryKey);
    const encryptedRecoveryKey = await encryptBox(recoveryKey, masterKey);

    const recoveryKeyAttributes = {
        masterKeyEncryptedWithRecoveryKey: encryptedMasterKey.encryptedData,
        masterKeyDecryptionNonce: encryptedMasterKey.nonce,
        recoveryKeyEncryptedWithMasterKey: encryptedRecoveryKey.encryptedData,
        recoveryKeyDecryptionNonce: encryptedRecoveryKey.nonce,
    };

    await putUserRecoveryKeyAttributes(recoveryKeyAttributes);

    saveKeyAttributes({ ...existingKeyAttributes, ...recoveryKeyAttributes });

    return recoveryKey;
};
