import { scaledImageDimensions } from "ente-media/image";
import { describe, expect, test } from "vitest";

describe("scaledImageDimensions", () => {
    test.each([
        [64, 64, 720, 64, 64],
        [320, 240, 720, 320, 240],
        [640, 480, 720, 640, 480],
        [720, 540, 720, 720, 540],
        [4000, 3000, 720, 720, 540],
        [3000, 4000, 720, 540, 720],
    ])(
        "scales %d×%d within %d to %d×%d",
        (width, height, maxDimension, expectedWidth, expectedHeight) => {
            expect(scaledImageDimensions(width, height, maxDimension)).toEqual({
                width: expectedWidth,
                height: expectedHeight,
            });
        },
    );

    test("preserves the invalid zero-dimension sentinel", () => {
        expect(scaledImageDimensions(0, 64, 720)).toEqual({
            width: 0,
            height: 0,
        });
    });
});
