import { describe, expect, it } from "vitest";
import fixtures from "../../../../rust/crates/ensu/tests/fixtures/history-text.json";
import { stripHiddenPartsText } from "../src/services/llm/history-text";

describe("shared assistant history cleanup", () => {
    for (const fixture of fixtures) {
        it(fixture.name, () => {
            expect(stripHiddenPartsText(fixture.input)).toBe(fixture.expected);
        });
    }
});
