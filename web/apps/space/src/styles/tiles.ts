export const spacePostTileRadius = 28;

export const spaceTileCornerStyles = (radius: number) => ({
    "--space-tile-radius": `${radius}px`,
    "--space-tile-padding": `${radius / 2}px`,
    borderRadius: "var(--space-tile-radius)",
});

export const spaceTileInnerRadius =
    "calc(var(--space-tile-radius) - var(--space-tile-padding))";

export const spaceTileCircleInset = (diameter: number) =>
    `max(var(--space-tile-padding), calc(var(--space-tile-radius) - ${diameter / 2}px))`;
