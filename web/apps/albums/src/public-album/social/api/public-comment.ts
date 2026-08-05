import { decryptBox, encryptBox } from "ente-base/crypto";
import {
    authenticatedPublicAlbumsRequestHeaders,
    ensureOk,
    type PublicAlbumsCredentials,
} from "ente-base/http";
import { apiURL } from "ente-base/origins";
import { z } from "zod";
import { type AnonIdentity, getStoredAnonIdentity } from "./public-reaction";

export interface PublicComment {
    id: string;
    collectionID: number;
    fileID?: number;
    parentCommentID?: string;
    userID: number;
    anonUserID?: string;
    text: string;
    isDeleted: boolean;
    createdAt: number;
    updatedAt: number;
}

export const addPublicComment = async (
    credentials: PublicAlbumsCredentials,
    collectionID: number,
    fileID: number,
    text: string,
    collectionKey: string,
    parentCommentID?: string,
    anonIdentity?: AnonIdentity,
): Promise<string> => {
    const identity = anonIdentity ?? getStoredAnonIdentity(collectionID);
    if (!identity) {
        throw new Error("No anonymous identity available");
    }

    const { encryptedData: cipher, nonce } = await encryptBox(
        new TextEncoder().encode(text),
        collectionKey,
    );

    const res = await fetch(await apiURL("/public-collection/comments"), {
        method: "POST",
        headers: {
            ...authenticatedPublicAlbumsRequestHeaders(credentials),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            fileID,
            cipher,
            nonce,
            parentCommentID,
            anonUserID: identity.anonUserID,
            anonToken: identity.token,
        }),
    });
    ensureOk(res);
    const { id } = CreateCommentResponse.parse(await res.json());
    return id;
};

export const deletePublicComment = async (
    credentials: PublicAlbumsCredentials,
    collectionID: number,
    commentID: string,
    anonIdentity?: AnonIdentity,
): Promise<void> => {
    const identity = anonIdentity ?? getStoredAnonIdentity(collectionID);
    if (!identity) {
        throw new Error("No anonymous identity available");
    }

    const res = await fetch(
        await apiURL(`/public-collection/comments/${commentID}`),
        {
            method: "DELETE",
            headers: {
                ...authenticatedPublicAlbumsRequestHeaders(credentials),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                anonUserID: identity.anonUserID,
                anonToken: identity.token,
            }),
        },
    );
    ensureOk(res);
};

export const getPublicFileComments = async (
    credentials: PublicAlbumsCredentials,
    fileID: number,
    collectionKey: string,
): Promise<PublicComment[]> => {
    const res = await fetch(
        await apiURL("/public-collection/comments/diff", {
            fileID,
            sinceTime: 0,
            limit: 1000,
        }),
        { headers: authenticatedPublicAlbumsRequestHeaders(credentials) },
    );
    ensureOk(res);
    const { comments } = GetPublicCommentsResponse.parse(await res.json());

    const decryptedComments: PublicComment[] = [];
    for (const comment of comments) {
        if (comment.isDeleted || !comment.cipher || !comment.nonce) {
            decryptedComments.push({
                id: comment.id,
                collectionID: comment.collectionID,
                fileID: comment.fileID ?? undefined,
                parentCommentID: comment.parentCommentID ?? undefined,
                userID: comment.userID,
                anonUserID: comment.anonUserID ?? undefined,
                text: "",
                isDeleted: comment.isDeleted,
                createdAt: comment.createdAt,
                updatedAt: comment.updatedAt,
            });
            continue;
        }
        try {
            const decryptedB64 = await decryptBox(
                { encryptedData: comment.cipher, nonce: comment.nonce },
                collectionKey,
            );
            const text = new TextDecoder().decode(
                Uint8Array.from(atob(decryptedB64), (c) => c.charCodeAt(0)),
            );
            decryptedComments.push({
                id: comment.id,
                collectionID: comment.collectionID,
                fileID: comment.fileID ?? undefined,
                parentCommentID: comment.parentCommentID ?? undefined,
                userID: comment.userID,
                anonUserID: comment.anonUserID ?? undefined,
                text,
                isDeleted: comment.isDeleted,
                createdAt: comment.createdAt,
                updatedAt: comment.updatedAt,
            });
        } catch {
            // Skip comments that fail to decrypt
        }
    }
    return decryptedComments;
};

const CreateCommentResponse = z.object({ id: z.string() });

const RemotePublicComment = z.object({
    id: z.string(),
    collectionID: z.number(),
    fileID: z.number().nullish(),
    parentCommentID: z.string().nullish(),
    userID: z.number(),
    anonUserID: z.string().nullish(),
    cipher: z.string().nullish(),
    nonce: z.string().nullish(),
    isDeleted: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

const GetPublicCommentsResponse = z.object({
    comments: z.array(RemotePublicComment),
    hasMore: z.boolean(),
});
