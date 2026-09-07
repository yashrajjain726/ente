import { spaceTouchTargetSize } from "styles/touch-targets";

const green = "#08C225";

export const spaceEmptyStateButtonSx = {
    alignItems: "center",
    appearance: "none",
    bgcolor: green,
    border: 0,
    borderRadius: "18px",
    boxSizing: "border-box",
    color: "#FFF",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    gap: "6px",
    height: spaceTouchTargetSize,
    justifyContent: "center",
    lineHeight: "18px",
    pointerEvents: "auto",
    px: "14px",
    py: 0,
    whiteSpace: "nowrap",
    "& svg": { display: "block", flexShrink: 0 },
    "&:disabled": { cursor: "default", opacity: 0.45 },
    "&:focus-visible": { outline: `2px solid ${green}`, outlineOffset: 2 },
    "&:hover:not(:disabled)": { bgcolor: "#07AE22" },
} as const;
