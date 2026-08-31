interface CircleSlot {
    column: number;
    row: number;
}

export interface HomeCirclePlacement {
    size: number;
    x: number;
    y: number;
}

const homeCircleSizeScale = 0.94;

export const homeCircleOrbitGap = (circleSize: number) =>
    Math.max(3, Math.min(9, circleSize * 0.04));

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
            columns: 2,
            rows: 2,
            slots: [
                { column: 0.5, row: 0 },
                { column: 0, row: 1 },
                { column: 1, row: 1 },
            ],
        };
    }

    const columns = 2;
    const rows = Math.ceil(count / columns);
    const singleCircleRow = count % columns ? (count == 5 ? 1 : rows - 1) : -1;
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

export const homeCirclePlacements = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeCirclePlacement[] => {
    if (count < 1 || canvasWidth <= 0 || canvasHeight <= 0) return [];

    const { columns, rows, slots } = circleSlotsForCount(count);
    const circleGapRatio = 0.1;
    const slotsByRow = Array.from({ length: rows }, (_, row) =>
        slots.filter((slot) => slot.row == row),
    );
    const rowOffsets = [0];
    for (let row = 1; row < rows; row++) {
        const rowsAreStaggered =
            slotsByRow[row - 1]!.length != slotsByRow[row]!.length;
        rowOffsets.push(rowOffsets[row - 1]! + (rowsAreStaggered ? 1 : 1.1));
    }
    const layoutWidth =
        count == 1
            ? 1 / 0.5
            : count == 2
              ? 1 / 0.48
              : columns + (columns - 1) * circleGapRatio;
    const layoutHeight = 1 + rowOffsets[rowOffsets.length - 1]!;
    const slotSize = Math.min(
        canvasWidth / layoutWidth,
        canvasHeight / layoutHeight,
    );
    const size = slotSize * homeCircleSizeScale;
    const circleInset = (slotSize - size) / 2;
    const horizontalStep = slotSize * (1 + circleGapRatio);
    const renderedWidth = slotSize + horizontalStep * (columns - 1);
    const renderedHeight = slotSize * layoutHeight;
    const originX = (canvasWidth - renderedWidth) / 2;
    const originY = (canvasHeight - renderedHeight) / 2;
    return slots.map(({ column, row }) => ({
        size,
        x: originX + column * horizontalStep + circleInset,
        y: originY + rowOffsets[row]! * slotSize + circleInset,
    }));
};
