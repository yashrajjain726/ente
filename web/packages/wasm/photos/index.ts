interface WrappedRootContactKey {
    encryptedKey: string;
    header: string;
}

interface OpenContactsInput {
    baseUrl: string;
    authToken: string;
    userId: number;
    masterKeyB64: string;
    cachedWrappedRootContactKey?: WrappedRootContactKey;
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

export const openContacts = async ({
    baseUrl,
    authToken,
    userId,
    masterKeyB64,
    cachedWrappedRootContactKey,
    clientPackage,
    clientVersion,
}: OpenContactsInput) => {
    const wasm = await import("./pkg/ente_photos_wasm");
    const session = wasm.openSession(
        baseUrl,
        authToken,
        masterKeyB64,
        clientPackage,
        clientVersion,
    );
    const client = wasm.openContacts(
        session,
        BigInt(userId),
        cachedWrappedRootContactKey?.encryptedKey,
        cachedWrappedRootContactKey?.header,
    );

    return {
        updateAuthToken: (authToken: string) =>
            session.updateAuthToken(authToken),
        currentWrappedRootContactKey: () =>
            client.currentWrappedRootContactKey() as
                | WrappedRootContactKey
                | undefined,
        getDiff: (sinceTime: number, limit: number) =>
            client.getDiff(BigInt(sinceTime), limit) as Promise<
                ContactRecord[]
            >,
        getProfilePicture: (contactID: string) =>
            client.getProfilePicture(contactID),
    };
};
