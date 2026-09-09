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
    warning: { light: "#f63a3a", dark: "#f63a3a" },
    warningDark: { light: "#dd3434", dark: "#dd3434" },
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

// Mirrors the Locker design-system text styles.
export const lockerTextDisplay2Sx = {
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 600,
};

export const lockerTextH2Sx = {
    fontSize: "18px",
    lineHeight: "24px",
    fontWeight: 600,
};

export const lockerTextLargeSx = {
    fontSize: "16px",
    lineHeight: "20px",
    fontWeight: 600,
};

export const lockerTextBodyBoldSx = {
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 600,
};

export const lockerTextMiniSx = {
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 500,
};
