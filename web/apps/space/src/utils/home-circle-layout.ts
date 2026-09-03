interface CircleSlot {
    column: number;
    row: number;
}

const gridFriendCountStart = 9;
const gridColumnCount = 3;
const circleGapRatio = 0.1;

export const usesHomeCircleGrid = (count: number) =>
    count >= gridFriendCountStart;

export interface HomeCirclePlacement {
    size: number;
    x: number;
    y: number;
}

export interface HomeCircleGridLayout {
    gap: number;
    rows: number;
    size: number;
}

const circleSlotsForCount = (count: number) => {
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
    const singleCircleRow = count % columns ? rows - 1 : -1;
    const slots: CircleSlot[] = [];
    for (let row = 0; row < rows; row++) {
        if (row == singleCircleRow) {
            slots.push({ column: 0.5, row });
        } else {
            slots.push({ column: 0, row }, { column: 1, row });
        }
    }
    return { columns, rows, slots };
};

const layoutDimensions = (columns: number, rows: number) => ({
    height: rows + (rows - 1) * circleGapRatio,
    width: columns + (columns - 1) * circleGapRatio,
});

export const homeCircleGridLayout = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeCircleGridLayout | undefined => {
    if (!usesHomeCircleGrid(count) || canvasWidth <= 0 || canvasHeight <= 0) {
        return undefined;
    }

    const rows = Math.ceil(count / gridColumnCount);
    const layout = layoutDimensions(gridColumnCount, rows);
    const size = Math.min(
        canvasWidth / layout.width,
        canvasHeight / layout.height,
    );
    return { gap: size * circleGapRatio, rows, size };
};

export const homeCirclePlacements = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeCirclePlacement[] => {
    if (
        count < 1 ||
        usesHomeCircleGrid(count) ||
        canvasWidth <= 0 ||
        canvasHeight <= 0
    ) {
        return [];
    }

    const { columns, rows, slots } = circleSlotsForCount(count);
    const rowOffsets = [0];
    for (let row = 1; row < rows; row++) {
        rowOffsets.push(rowOffsets[row - 1]! + 1.1);
    }
    const layout = layoutDimensions(columns, rows);
    const size = Math.min(
        canvasWidth / layout.width,
        canvasHeight / layout.height,
    );
    const horizontalStep = size * (1 + circleGapRatio);
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
