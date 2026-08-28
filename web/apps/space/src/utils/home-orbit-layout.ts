export interface HomeOrbitPlacement {
    avatarSize: number;
    radius: number;
    top: number;
}

export const homeOrbitPlacements = (
    count: number,
    canvasWidth: number,
    canvasHeight: number,
): HomeOrbitPlacement[] => {
    if (count < 1 || canvasWidth <= 0 || canvasHeight <= 0) return [];

    const radius = canvasWidth * 1.2;
    const verticalInset = Math.min(144, canvasHeight * 0.22);
    const availableSpan = Math.max(0, canvasHeight - verticalInset * 2);
    const preferredGap = Math.min(160, canvasHeight * 0.22);
    const orbitGap =
        count > 1 ? Math.min(preferredGap, availableSpan / (count - 1)) : 0;
    const baseSize = Math.min(canvasWidth * 0.34, canvasHeight * 0.2);
    const countSize = baseSize / (1 + (count - 1) * 0.06);
    const avatarSize =
        count > 1 ? Math.min(countSize, orbitGap * 0.82) : countSize;
    const stackHeight = orbitGap * (count - 1);
    const stackTop = (canvasHeight - stackHeight) / 2;

    return Array.from({ length: count }, (_, index) => ({
        avatarSize,
        radius,
        top: stackTop + orbitGap * index,
    }));
};
