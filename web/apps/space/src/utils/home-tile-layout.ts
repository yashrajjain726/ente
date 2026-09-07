import { maximumSpaceFriendCount } from "utils/friend-limits";

interface TileSlot {
    column: number;
    row: number;
}

const gridFriendCountStart = 9;
const gridColumnCount = 3;
const tileGapRatio = 0.1;
const verticalInset = 16;

export const maximumHomeTileCount = maximumSpaceFriendCount;

export const usesHomeTileGrid = (count: number) =>
    count >= gridFriendCountStart && count <= maximumHomeTileCount;

export interface HomeTilePlacement {
    size: number;
    x: number;
    y: number;
}

export interface HomeTileGridLayout {
    gap: number;
    rows: number;
    size: number;
}

const tileSlotsForCount = (count: number) => {
    if (count == 1) {
        return { columns: 1, rows: 1, slots: [{ column: 0, row: 0 }] };
    }
    if (count == 2) {
        return {
            columns: 1,
            rows: 2,
            slots: [
                { column: 0, row: 0 },
                { column: 0, row: 1 },
            ],
        };
    }
    if (count == 3) {
        return {
            columns: 1,
            rows: 3,
            slots: [
                { column: 0, row: 0 },
                { column: 0, row: 1 },
                { column: 0, row: 2 },
            ],
        };
    }

    const columns = 2;
    const rows = Math.ceil(count / columns);
    const singleTileRow = count % columns ? rows - 1 : -1;
    const slots: TileSlot[] = [];
    for (let row = 0; row < rows; row++) {
        if (row == singleTileRow) {
            slots.push({ column: 0.5, row });
        } else {
            slots.push({ column: 0, row }, { column: 1, row });
        }
    }
    return { columns, rows, slots };
};

const layoutDimensions = (columns: number, rows: number) => ({
    height: rows + (rows - 1) * tileGapRatio,
    width: columns + (columns - 1) * tileGapRatio,
});

export const homeTileGridLayout = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeTileGridLayout | undefined => {
    if (!usesHomeTileGrid(count) || canvasWidth <= 0 || canvasHeight <= 0) {
        return undefined;
    }

    const rows = Math.ceil(count / gridColumnCount);
    const layout = layoutDimensions(gridColumnCount, rows);
    const availableHeight = Math.max(0, canvasHeight - 2 * verticalInset);
    const size = Math.min(
        canvasWidth / layout.width,
        availableHeight / layout.height,
    );
    return { gap: size * tileGapRatio, rows, size };
};

export const homeTilePlacements = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeTilePlacement[] => {
    if (
        count < 1 ||
        count > maximumHomeTileCount ||
        usesHomeTileGrid(count) ||
        canvasWidth <= 0 ||
        canvasHeight <= 0
    ) {
        return [];
    }

    const { columns, rows, slots } = tileSlotsForCount(count);
    const rowOffsets = [0];
    for (let row = 1; row < rows; row++) {
        rowOffsets.push(rowOffsets[row - 1]! + 1.1);
    }
    const layout = layoutDimensions(columns, rows);
    const availableHeight = Math.max(0, canvasHeight - 2 * verticalInset);
    const size = Math.min(
        canvasWidth / layout.width,
        availableHeight / layout.height,
    );
    const horizontalStep = size * (1 + tileGapRatio);
    const renderedWidth = size + horizontalStep * (columns - 1);
    const renderedHeight = size * layout.height;
    const originX = (canvasWidth - renderedWidth) / 2;
    const originY = (canvasHeight - renderedHeight) / 2;
    return slots.map(({ column, row }) => ({
        size,
        x: originX + column * horizontalStep,
        y: originY + rowOffsets[row]! * size,
    }));
};
