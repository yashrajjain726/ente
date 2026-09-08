import { expect, test } from "vitest";
import {
    homeTileLayout,
    minimumHomeTileCanvasHeight,
} from "../src/utils/home-tile-layout";

test("the empty state gives the add-friend tile the whole canvas", () => {
    expect(homeTileLayout(0, 358, 520)).toEqual({
        friends: [],
        addFriend: { x: 0, y: 0, width: 358, height: 520 },
        addFriendVariant: "empty",
    });
});

test.each([1, 2])(
    "%i friends fill the canvas without an add-friend tile",
    (count) => {
        const layout = homeTileLayout(count, 358, 520)!;
        expect(layout.friends).toHaveLength(count);
        for (const friend of layout.friends) {
            expect(friend.x).toBe(0);
            expect(friend.width).toBe(358);
        }
        expect(layout.friends[0]!.y).toBe(0);
        const lastFriend = layout.friends.at(-1)!;
        expect(lastFriend.y + lastFriend.height).toBe(520);
        expect(layout.addFriend).toBeUndefined();
    },
);

test.each([3, 5, 7])(
    "%i friends use the last cell for adding a friend",
    (count) => {
        const layout = homeTileLayout(count, 358, 600)!;
        const lastFriend = layout.friends.at(-1)!;
        expect(layout.addFriend).toEqual({
            x: 185,
            y: lastFriend.y,
            width: lastFriend.width,
            height: lastFriend.height,
        });
        expect(lastFriend.x).toBe(0);
        expect(layout.addFriendVariant).toBe("tile");
    },
);

test.each([4, 6, 8])(
    "%i friends fill two columns without an add-friend tile",
    (count) => {
        const layout = homeTileLayout(count, 358, 600)!;
        expect(new Set(layout.friends.map(({ x }) => x))).toEqual(
            new Set([0, 185]),
        );
        expect(new Set(layout.friends.map(({ y }) => y)).size).toBe(count / 2);
        const lastFriend = layout.friends.at(-1)!;
        expect(lastFriend.y + lastFriend.height).toBe(600);
        expect(layout.addFriend).toBeUndefined();
    },
);

test("nine friends fill a three-by-three grid without an add tile", () => {
    const layout = homeTileLayout(9, 360, 600)!;
    expect(layout.addFriend).toBeUndefined();
    expect(layout.friends).toHaveLength(9);
    expect(new Set(layout.friends.map(({ x }) => x))).toEqual(
        new Set([0, 124, 248]),
    );
    expect(new Set(layout.friends.map(({ y }) => y))).toEqual(
        new Set([0, 204, 408]),
    );
    for (const friend of layout.friends) {
        expect(friend.width).toBe(112);
        expect(friend.height).toBe(192);
    }
    expect(layout.friends.at(-1)).toEqual({
        x: 248,
        y: 408,
        width: 112,
        height: 192,
    });
});

test.each([288, 358])(
    "all layouts fill a %ipx canvas without overlapping",
    (width) => {
        for (let count = 0; count <= 9; count++) {
            const height = minimumHomeTileCanvasHeight(count);
            const layout = homeTileLayout(count, width, height)!;
            const tiles = [
                ...layout.friends,
                ...(layout.addFriend ? [layout.addFriend] : []),
            ];
            expect(tiles).toHaveLength([1, 1, 2, 4, 4, 6, 6, 8, 8, 9][count]!);
            expect(
                Math.max(...tiles.map((tile) => tile.x + tile.width)),
            ).toBeCloseTo(width);
            expect(
                Math.max(...tiles.map((tile) => tile.y + tile.height)),
            ).toBeCloseTo(height);
            for (const [index, tile] of tiles.entries()) {
                expect(tile.x).toBeGreaterThanOrEqual(0);
                expect(tile.y).toBeGreaterThanOrEqual(0);
                expect(tile.height).toBeGreaterThanOrEqual(104);
                for (const other of tiles.slice(index + 1)) {
                    expect(
                        tile.x + tile.width <= other.x ||
                            other.x + other.width <= tile.x ||
                            tile.y + tile.height <= other.y ||
                            other.y + other.height <= tile.y,
                    ).toBe(true);
                }
            }
        }
    },
);
