interface WrappedRootContactKey {
    encryptedKey: string;
    header: string;
}

interface OpenSessionInput {
    baseUrl: string;
    authToken: string;
    masterKeyB64: string;
    clientPackage?: string;
    clientVersion?: string;
}

interface ContactRecord {
    id: string;
    contactUserId: number;
    email?: string;
    name?: string;
    profilePictureAttachmentID?: string;
    isDeleted: boolean;
    updatedAt: number;
}

interface ContactsDiffOutput {
    records: ContactRecord[];
    wrappedRootContactKey?: WrappedRootContactKey;
}

interface ProfilePictureOutput {
    bytes: Uint8Array;
    wrappedRootContactKey?: WrappedRootContactKey;
}

const wasm = () => import("./pkg/ente_photos_wasm");

export type Session = import("./pkg/ente_photos_wasm").Session;

export const openSession = async ({
    baseUrl,
    authToken,
    masterKeyB64,
    clientPackage,
    clientVersion,
}: OpenSessionInput): Promise<Session> =>
    (await wasm()).openSession(
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    );

export const contactsGetDiff = async (
    session: Session,
    wrappedRootContactKey: WrappedRootContactKey | undefined,
    sinceTime: number,
    limit: number,
): Promise<ContactsDiffOutput> =>
    (await wasm()).contactsGetDiff(
        session,
        wrappedRootContactKey?.encryptedKey,
        wrappedRootContactKey?.header,
        BigInt(sinceTime),
        limit,
    );

export const contactsGetProfilePicture = async (
    session: Session,
    wrappedRootContactKey: WrappedRootContactKey | undefined,
    contactID: string,
): Promise<ProfilePictureOutput> =>
    (await wasm()).contactsGetProfilePicture(
        session,
        wrappedRootContactKey?.encryptedKey,
        wrappedRootContactKey?.header,
        contactID,
    );
