import { describe, expect, it } from "vitest";
import fixtures from "../../../../rust/crates/ensu/tests/fixtures/generation-budgets-v1.json";
import { resolveGenerationBudget } from "../src/services/llm/budget";

describe("shared generation budgets", () => {
    for (const fixture of fixtures) {
        it(fixture.name, () => {
            const resolve = () =>
                resolveGenerationBudget(
                    fixture.context,
                    fixture.configured ?? undefined,
                );
            if (fixture.output === null) expect(resolve).toThrow();
            else
                expect(resolve()).toEqual({
                    contextSize: fixture.context,
                    maxTokens: fixture.output,
                    inputBudget: fixture.input,
                });
        });
    }
    it("rejects malformed JavaScript settings instead of using Auto", () => {
        for (const value of [
            -1,
            1.5,
            NaN,
            Infinity,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            expect(() => resolveGenerationBudget(value)).toThrow();
            expect(() => resolveGenerationBudget(12000, value)).toThrow();
        }
    });
});
