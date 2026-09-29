import { describe, expect, test } from "vitest";
import { uploadQueueItemKey } from "../src/components/create-item/file-upload-helpers";
import {
    hasPendingUploads,
    hasUnsavedItemChanges,
} from "../src/components/create-item/unsaved-changes";
import type { LockerUploadCandidate } from "../src/types";

describe("unsaved item changes", () => {
    test("an empty new form and its default collection are clean", () => {
        expect(hasUnsavedItemChanges({}, {}, [1], [1], "")).toBe(false);
        expect(
            hasUnsavedItemChanges({ title: "", content: "" }, {}, [], [], ""),
        ).toBe(false);
    });

    test.each<Record<string, string>>([
        { title: "Incomplete note" },
        { content: "My instructions" },
        { password: "unsaved password" },
        { location: "Spare key location" },
        { contactDetails: "New contact details" },
        { name: "Document title" },
    ])(
        "protects edits even when required fields are incomplete: %j",
        (data) => {
            expect(hasUnsavedItemChanges(data, {}, [], [], "")).toBe(true);
        },
    );

    test("an unchanged existing item or reverted edit is clean", () => {
        const initial = { title: "Title", content: "Content" };
        expect(
            hasUnsavedItemChanges(
                { ...initial, notes: "" },
                initial,
                [2, 1],
                [1, 2],
                "",
            ),
        ).toBe(false);
        expect(
            hasUnsavedItemChanges(
                { ...initial, content: "Changed" },
                initial,
                [1],
                [1],
                "",
            ),
        ).toBe(true);
        expect(
            hasUnsavedItemChanges({ ...initial }, initial, [1], [1], ""),
        ).toBe(false);
    });

    test("clearing an existing field or changing whitespace is an edit", () => {
        expect(
            hasUnsavedItemChanges({}, { name: "Original" }, [], [], ""),
        ).toBe(true);
        expect(hasUnsavedItemChanges({ content: " " }, {}, [], [], "")).toBe(
            true,
        );
        expect(
            hasUnsavedItemChanges(
                { content: "Text " },
                { content: "Text" },
                [],
                [],
                "",
            ),
        ).toBe(true);
    });

    test("collection membership changes count, but order and duplicates do not", () => {
        expect(hasUnsavedItemChanges({}, {}, [2], [1], "")).toBe(true);
        expect(hasUnsavedItemChanges({}, {}, [], [1], "")).toBe(true);
        expect(hasUnsavedItemChanges({}, {}, [1, 2], [1], "")).toBe(true);
        expect(hasUnsavedItemChanges({}, {}, [2, 1, 1], [1, 2], "")).toBe(
            false,
        );
    });

    test("an unfinished collection name is protected until cleared", () => {
        expect(hasUnsavedItemChanges({}, {}, [], [], "New collection")).toBe(
            true,
        );
        expect(hasUnsavedItemChanges({}, {}, [], [], "")).toBe(false);
    });
});

describe("pending uploads", () => {
    const first: LockerUploadCandidate = {
        file: new File(["First"], "first.txt"),
        suggestedCollectionNames: [],
    };
    const second: LockerUploadCandidate = {
        file: new File(["Second"], "second.txt"),
        suggestedCollectionNames: ["Documents"],
    };

    test("an empty queue is clean", () => {
        expect(hasPendingUploads([], new Set())).toBe(false);
    });

    test("selected or prefilled files need confirmation before any upload", () => {
        expect(hasPendingUploads([first], new Set())).toBe(true);
    });

    test("a partial upload with pending or failed files remains protected", () => {
        expect(
            hasPendingUploads(
                [first, second],
                new Set([uploadQueueItemKey(first)]),
            ),
        ).toBe(true);
    });

    test("completed files alone are clean, including after removing failed files", () => {
        const completed = new Set([
            uploadQueueItemKey(first),
            uploadQueueItemKey(second),
        ]);
        expect(hasPendingUploads([first, second], completed)).toBe(false);
        expect(hasPendingUploads([first], completed)).toBe(false);
        expect(hasPendingUploads([], completed)).toBe(false);
    });
});
