import {
    deriveSubKeyBytes,
    generateDeriveKeySalt,
    toB64,
} from "ente-base/crypto";
import {
    authenticatedRequestHeaders,
    ensureOk,
    publicRequestHeaders,
} from "ente-base/http";
import { apiURL } from "ente-base/origins";
import { ensure } from "ente-utils/ensure";
import { SRP, SrpClient } from "fast-srp-hap";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { saveSRPAttributes } from "./accounts-db";
import {
    RemoteSRPVerificationResponse,
    type EmailOrSRPVerificationResponse,
} from "./user";

export interface SRPAttributes {
    srpUserID: string;
    srpSalt: string;
    memLimit: number;
    opsLimit: number;
    kekSalt: string;
    isEmailMFAEnabled: boolean;
}

export const RemoteSRPAttributes = z.object({
    srpUserID: z.string(),
    srpSalt: z.string(),
    memLimit: z.number(),
    opsLimit: z.number(),
    kekSalt: z.string(),
    isEmailMFAEnabled: z.boolean(),
});

export const getSRPAttributes = async (
    email: string,
): Promise<SRPAttributes | undefined> => {
    const res = await fetch(await apiURL("/users/srp/attributes", { email }), {
        headers: publicRequestHeaders(),
    });
    if (res.status == 404) return undefined;
    ensureOk(res);
    return z.object({ attributes: RemoteSRPAttributes }).parse(await res.json())
        .attributes;
};

// SRP setup needs the KEK (to derive these values) but can complete only
// after the client has an auth token, which during signup arrives only after
// email verification. That verification can outlast the browser tab, so these
// values are stashed in local storage rather than kept in memory.
export const SRPSetupAttributes = z.object({
    srpUserID: z.string(),
    srpSalt: z.string(),
    srpVerifier: z.string(),
    loginSubKey: z.string(),
});

export type SRPSetupAttributes = z.infer<typeof SRPSetupAttributes>;

export const generateSRPSetupAttributes = async (
    kek: string,
): Promise<SRPSetupAttributes> => {
    const loginSubKey = await deriveSRPLoginSubKey(kek);

    // Museum schema requires this to be a UUID.
    const srpUserID = uuidv4();
    const srpSalt = await generateDeriveKeySalt();

    const srpVerifier = bufferToB64(
        SRP.computeVerifier(
            SRP.params["4096"],
            b64ToBuffer(srpSalt),
            Buffer.from(srpUserID),
            b64ToBuffer(loginSubKey),
        ),
    );

    return { srpUserID, srpSalt, srpVerifier, loginSubKey };
};

const deriveSRPLoginSubKey = async (kek: string) => {
    const kekSubKeyBytes = await deriveSubKeyBytes(kek, 32, 1, "loginctx");
    // Derive 32 bytes and use the first 16 as the SRP password. Asking the
    // KDF for 16 bytes directly would produce a different value.
    return toB64(kekSubKeyBytes.slice(0, 16));
};

const b64ToBuffer = (base64: string) => Buffer.from(base64, "base64");

const bufferToB64 = (buffer: Buffer) => buffer.toString("base64");

export const setupSRP = async (srpSetupAttributes: SRPSetupAttributes) =>
    srpSetupOrReconfigure(srpSetupAttributes, completeSRPSetup);

type SRPSetupOrReconfigureExchangeCallback = ({
    setupID,
    srpM1,
}: {
    setupID: string;
    srpM1: string;
}) => Promise<{ srpM2: string }>;

const srpSetupOrReconfigure = async (
    { srpSalt, srpUserID, srpVerifier, loginSubKey }: SRPSetupAttributes,
    exchangeCB: SRPSetupOrReconfigureExchangeCallback,
) => {
    const srpClient = await generateSRPClient(srpSalt, srpUserID, loginSubKey);

    const srpA = bufferToB64(srpClient.computeA());

    const { setupID, srpB } = await startSRPSetup({
        srpUserID,
        srpSalt,
        srpVerifier,
        srpA,
    });

    srpClient.setB(b64ToBuffer(srpB));

    const srpM1 = bufferToB64(srpClient.computeM1());

    const { srpM2 } = await exchangeCB({ srpM1, setupID });

    srpClient.checkM2(b64ToBuffer(srpM2));
};

const generateSRPClient = async (
    srpSalt: string,
    srpUserID: string,
    loginSubKey: string,
) =>
    new Promise<SrpClient>((resolve, reject) => {
        SRP.genKey((err, clientKey) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(
                new SrpClient(
                    SRP.params["4096"],
                    b64ToBuffer(srpSalt),
                    Buffer.from(srpUserID),
                    b64ToBuffer(loginSubKey),
                    clientKey!,
                    false,
                ),
            );
        });
    });

interface SetupSRPRequest {
    srpUserID: string;
    srpSalt: string;
    srpVerifier: string;
    srpA: string;
}

const SetupSRPResponse = z.object({ setupID: z.string(), srpB: z.string() });

type SetupSRPResponse = z.infer<typeof SetupSRPResponse>;

const startSRPSetup = async (
    setupSRPRequest: SetupSRPRequest,
): Promise<SetupSRPResponse> => {
    const res = await fetch(await apiURL("/users/srp/setup"), {
        method: "POST",
        headers: await authenticatedRequestHeaders(),
        body: JSON.stringify(setupSRPRequest),
    });
    ensureOk(res);
    return SetupSRPResponse.parse(await res.json());
};

interface CompleteSRPSetupRequest {
    setupID: string;
    srpM1: string;
}

const CompleteSRPSetupResponse = z.object({
    setupID: z.string(),
    srpM2: z.string(),
});

type CompleteSRPSetupResponse = z.infer<typeof CompleteSRPSetupResponse>;

const completeSRPSetup = async (
    completeSRPSetupRequest: CompleteSRPSetupRequest,
) => {
    const res = await fetch(await apiURL("/users/srp/complete"), {
        method: "POST",
        headers: await authenticatedRequestHeaders(),
        body: JSON.stringify(completeSRPSetupRequest),
    });
    ensureOk(res);
    return CompleteSRPSetupResponse.parse(await res.json());
};

export const getAndSaveSRPAttributes = async (userEmail: string) =>
    saveSRPAttributes(ensure(await getSRPAttributes(userEmail)));

export interface UpdatedKeyAttr {
    kekSalt: string;
    encryptedKey: string;
    keyDecryptionNonce: string;
    opsLimit: number;
    memLimit: number;
}

export const updateSRPAndKeyAttributes = (
    srpSetupAttributes: SRPSetupAttributes,
    updatedKeyAttr: UpdatedKeyAttr,
) =>
    srpSetupOrReconfigure(srpSetupAttributes, ({ setupID, srpM1 }) =>
        updateSRPAndKeys({ setupID, srpM1, updatedKeyAttr }),
    );

export interface UpdateSRPAndKeysRequest {
    setupID: string;
    srpM1: string;
    updatedKeyAttr: UpdatedKeyAttr;
    // Remote treats an omitted value as true, invalidating all other sessions
    // of the user.
    logOutOtherDevices?: boolean;
}

const UpdateSRPAndKeysResponse = z.object({
    srpM2: z.string(),
    setupID: z.string(),
});

type UpdateSRPAndKeysResponse = z.infer<typeof UpdateSRPAndKeysResponse>;

const updateSRPAndKeys = async (
    updateSRPAndKeysRequest: UpdateSRPAndKeysRequest,
): Promise<UpdateSRPAndKeysResponse> => {
    const res = await fetch(await apiURL("/users/srp/update"), {
        method: "POST",
        headers: await authenticatedRequestHeaders(),
        body: JSON.stringify(updateSRPAndKeysRequest),
    });
    ensureOk(res);
    return UpdateSRPAndKeysResponse.parse(await res.json());
};

export const srpVerificationUnauthorizedErrorMessage =
    "SRP verification failed (HTTP 401 Unauthorized)";

export const verifySRP = async (
    { srpUserID, srpSalt }: SRPAttributes,
    kek: string,
): Promise<EmailOrSRPVerificationResponse> => {
    const loginSubKey = await deriveSRPLoginSubKey(kek);
    const srpClient = await generateSRPClient(srpSalt, srpUserID, loginSubKey);

    const { srpB, sessionID } = await createSRPSession({
        srpUserID,
        srpA: bufferToB64(srpClient.computeA()),
    });

    srpClient.setB(b64ToBuffer(srpB));

    const { srpM2, ...rest } = await verifySRPSession({
        sessionID,
        srpUserID,
        srpM1: bufferToB64(srpClient.computeM1()),
    });

    srpClient.checkM2(b64ToBuffer(srpM2));

    return rest;
};

interface CreateSRPSessionRequest {
    srpUserID: string;
    srpA: string;
}

const CreateSRPSessionResponse = z.object({
    sessionID: z.string(),
    srpB: z.string(),
});

type CreateSRPSessionResponse = z.infer<typeof CreateSRPSessionResponse>;

const createSRPSession = async (
    createSRPSessionRequest: CreateSRPSessionRequest,
): Promise<CreateSRPSessionResponse> => {
    const res = await fetch(await apiURL("/users/srp/create-session"), {
        method: "POST",
        headers: publicRequestHeaders(),
        body: JSON.stringify(createSRPSessionRequest),
    });
    ensureOk(res);
    return CreateSRPSessionResponse.parse(await res.json());
};

interface VerifySRPSessionRequest {
    sessionID: string;
    srpUserID: string;
    srpM1: string;
}

type SRPVerificationResponse = z.infer<typeof RemoteSRPVerificationResponse>;

const verifySRPSession = async (
    verifySRPSessionRequest: VerifySRPSessionRequest,
): Promise<SRPVerificationResponse> => {
    const res = await fetch(await apiURL("/users/srp/verify-session"), {
        method: "POST",
        headers: publicRequestHeaders(),
        body: JSON.stringify(verifySRPSessionRequest),
    });
    if (res.status == 401) {
        throw new Error(srpVerificationUnauthorizedErrorMessage);
    }
    ensureOk(res);
    return RemoteSRPVerificationResponse.parse(await res.json());
};
