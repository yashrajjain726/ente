import { expect, test } from "vitest";
import {
    profilePhotoGap,
    profilePhotoMinRowHeight,
    profilePhotoRows,
} from "../src/utils/profile-photo-layout";

const photos = (ratios: number[]) =>
    ratios.map((aspectRatio, id) => ({ id, aspectRatio }));

test("a portrait and landscape share a row at their allocated widths", () => {
    const tiles = photos([3 / 4, 3 / 2]);
    expect(profilePhotoRows(tiles, 363)).toEqual([
        { aspectRatio: 2.25, height: 160, tiles },
    ]);
});

test("short landscape rows split without changing photo dimensions", () => {
    const tiles = photos([4 / 3, 5 / 4, 7 / 4]);
    const rows = profilePhotoRows(tiles, 328);
    expect(rows.map(({ tiles }) => tiles.length)).toEqual([2, 1]);
    expect(rows.flatMap(({ tiles }) => tiles)).toEqual(tiles);
});

test("portrait photos can still share a three-photo row", () => {
    expect(
        profilePhotoRows(photos([2 / 3, 3 / 4, 2 / 3]), 328).map(
            ({ tiles }) => tiles.length,
        ),
    ).toEqual([3]);
});

test("row grouping adapts to the available width and accounts for gaps", () => {
    const tiles = photos([1.5, 1.5, 1.5]);
    expect(
        profilePhotoRows(tiles, 302).map(({ tiles }) => tiles.length),
    ).toEqual([1, 1, 1]);
    expect(
        profilePhotoRows(tiles, 303).map(({ tiles }) => tiles.length),
    ).toEqual([2, 1]);
    expect(
        profilePhotoRows(tiles, 456).map(({ tiles }) => tiles.length),
    ).toEqual([3]);
});

test("a panorama keeps its aspect ratio even when it cannot reach the minimum", () => {
    const tiles = photos([8, 1, 1]);
    const rows = profilePhotoRows(tiles, 328);
    expect(rows.map(({ tiles }) => tiles.length)).toEqual([1, 2]);
    expect(rows[0]!.aspectRatio).toBe(8);
});

test.each([288, 328, 358, 568])(
    "rows preserve order, fill a %ipx grid, and meet the minimum when possible",
    (width) => {
        const tiles = photos([1.5, 1.2, 1.8, 0.75, 0.6, 8, 0.05, 1, 2, 1.5]);
        const rows = profilePhotoRows(tiles, width);
        expect(rows.flatMap(({ tiles }) => tiles)).toEqual(tiles);
        for (const row of rows) {
            const gaps = (row.tiles.length - 1) * profilePhotoGap;
            expect(
                row.tiles.reduce(
                    (sum, tile) => sum + tile.aspectRatio * row.height,
                    gaps,
                ),
            ).toBeCloseTo(width);
            expect(row.height).toBeGreaterThanOrEqual(
                Math.min(
                    profilePhotoMinRowHeight,
                    width / row.tiles[0]!.aspectRatio,
                ),
            );
        }
    },
);

test("an empty grid has no rows", () => {
    expect(profilePhotoRows([], 328)).toEqual([]);
});
