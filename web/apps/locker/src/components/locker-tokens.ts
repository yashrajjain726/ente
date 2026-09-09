// Mirrors the Locker mobile design tokens in mobile/packages/ente_components/lib/theme/*.dart.
import type { Theme } from "@mui/material";

export const lockerColors = {
    backgroundBase: { light: "#f4f4f4", dark: "#161616" },
    fillLight: { light: "#ffffff", dark: "#212121" },
    fillDark: { light: "#eaeaea", dark: "#0a0a0a" },
    strokeFaint: { light: "#ebebeb", dark: "#2a2a2a" },
    textBase: { light: "#000000", dark: "#ffffff" },
    textLight: { light: "#666666", dark: "#999999" },
    textLighter: { light: "#969696", dark: "#969696" },
    iconColor: { light: "rgba(0, 0, 0, 0.75)", dark: "#ffffff" },
    primary: { light: "#1071ff", dark: "#1071ff" },
    primaryDark: { light: "#0e5fd9", dark: "#0e5fd9" },
    specialWhite: { light: "#ffffff", dark: "#ffffff" },
} as const;

export const lockerColorSx = (
    theme: Theme,
    colors: Partial<
        Record<
            "backgroundColor" | "color" | "borderColor",
            keyof typeof lockerColors
        >
    >,
) => {
    const darkValues: Record<string, string> = {};
    const lightValues: Record<string, string> = {};
    for (const [prop, role] of Object.entries(colors)) {
        darkValues[prop] = lockerColors[role].dark;
        lightValues[prop] = lockerColors[role].light;
    }
    return { ...darkValues, ...theme.applyStyles("light", lightValues) };
};

export const lockerContentMaxWidth = 700;

export const lockerTextBodySx = {
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 500,
};
