import type { Theme } from "@mui/material";
import { lockerColorSx, lockerShadowFloating } from "./locker-tokens";

export const lockerMenuPaperSx = (theme: Theme) => ({
    "& .MuiMenuItem-root:last-of-type": { borderBottomColor: "transparent" },
    width: 196,
    borderRadius: "20px",
    overflowX: "hidden" as const,
    overflowY: "auto" as const,
    boxShadow: lockerShadowFloating,
    border: "1px solid",
    ...lockerColorSx(theme, {
        backgroundColor: "fillLight",
        borderColor: "strokeFaint",
    }),
});

export const lockerSheetPaperSx = (theme: Theme) => ({
    borderRadius: "24px",
    width: "min(100%, 440px)",
    padding: "20px",
    ...lockerColorSx(theme, { backgroundColor: "backgroundBase" }),
    [theme.breakpoints.down("sm")]: {
        margin: 0,
        width: "100%",
        maxWidth: "100%",
        borderRadius: "20px 20px 0 0",
        paddingBottom: "34px",
    },
});

export const lockerSheetContainerSx = {
    alignItems: { xs: "flex-end", sm: "center" },
};
