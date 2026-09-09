import { maximumSpaceFriendCount } from "./friend-limits";

export const homeTileGap = 12;

export const maximumHomeTileCount = maximumSpaceFriendCount;

export interface HomeTilePlacement {
    height: number;
    width: number;
    x: number;
    y: number;
}

export type AddFriendTileVariant = "empty" | "tile";

const friendColumnCount = (count: number) =>
    count == maximumHomeTileCount ? 3 : count <= 2 ? 1 : 2;

const friendRowCount = (count: number) =>
    Math.ceil(count / friendColumnCount(count));

export const minimumHomeTileCanvasHeight = (count: number) => {
    const rows = friendRowCount(count);
    return Math.max(320, rows * 104 + Math.max(0, rows - 1) * homeTileGap);
};

export const homeTileLayout = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
):
    | {
          friends: HomeTilePlacement[];
          addFriend?: HomeTilePlacement;
          addFriendVariant: AddFriendTileVariant;
      }
    | undefined => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return undefined;

    if (count == 0) {
        return {
            friends: [],
            addFriend: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
            addFriendVariant: "empty",
        };
    }

    const columns = friendColumnCount(count);
    const rows = friendRowCount(count);
    const width = (canvasWidth - (columns - 1) * homeTileGap) / columns;
    const height = (canvasHeight - (rows - 1) * homeTileGap) / rows;
    const placementFor = (index: number): HomeTilePlacement => ({
        x: (index % columns) * (width + homeTileGap),
        y: Math.floor(index / columns) * (height + homeTileGap),
        width,
        height,
    });
    return {
        friends: Array.from({ length: count }, (_, index) =>
            placementFor(index),
        ),
        addFriend: [3, 5, 7].includes(count) ? placementFor(count) : undefined,
        addFriendVariant: "tile",
    };
};
