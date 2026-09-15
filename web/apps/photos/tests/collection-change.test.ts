import {
    RemoteCollectionChange,
    RemoteCollectionDeletionTombstone,
} from "ente-media/collection";
import { describe, expect, test } from "vitest";
import { deletedExportedCollectionIDs } from "../src/services/export-collection-state";

describe("collection deletion tombstones", () => {
    test("parses without active collection fields", () => {
        const parsed = RemoteCollectionChange.parse({
            id: 7,
            owner: { id: 1, email: "" },
            encryptedKey: "compatibility-key",
            type: "album",
            attributes: {},
            updationTime: 9,
            isDeleted: true,
            name: "must not survive parsing",
            magicMetadata: { data: "must not survive parsing" },
        });

        expect(parsed).toEqual({
            id: 7,
            owner: { id: 1 },
            updationTime: 9,
            isDeleted: true,
        });
        expect(RemoteCollectionDeletionTombstone.parse(parsed)).toStrictEqual(
            parsed,
        );
    });

    test("keeps active collection fields required", () => {
        expect(() =>
            RemoteCollectionChange.parse({
                id: 7,
                owner: { id: 1 },
                updationTime: 9,
                isDeleted: false,
            }),
        ).toThrow();
    });

    test("desktop export finds removed collections using IDs only", () => {
        expect(
            deletedExportedCollectionIDs([1], {
                1: "Current album",
                7: "Former shared album",
            }),
        ).toEqual([7]);
    });
});
