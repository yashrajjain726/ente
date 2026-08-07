import { useMediaQuery } from "@mui/material";

/**
 * The media query below which the upload progress surfaces switch to their
 * mobile presentation: dialogs become full width bottom sheets, and the
 * minimized pill docks above the bottom edge.
 *
 * This matches the cutoff at which the upload progress internals (summary
 * grid, stat grid, in-progress rows) already reflow, so the sheet switch and
 * those reflows engage together.
 */
export const uploadSheetMediaQuery = "@media (max-width: 620px)";

/**
 * Return `true` if the viewport is narrow enough that the upload progress
 * dialogs should be presented as bottom sheets.
 */
export const useIsUploadSheet = () => useMediaQuery(uploadSheetMediaQuery);

/**
 * Mobile overrides that convert a dialog's paper into a bottom sheet.
 *
 * Layer this on top of the dialog's existing paper sx (which retains the
 * surface color, border and 20px radius); above {@link uploadSheetMediaQuery}
 * it has no effect.
 */
export const uploadSheetPaperSx = {
    [uploadSheetMediaQuery]: {
        position: "fixed",
        bottom: 0,
        left: 0,
        m: 0,
        width: "100%",
        maxWidth: "none",
        maxHeight: "calc(100dvh - 72px)",
        borderRadius: "20px 20px 0 0",
        borderBottom: "none",
        "&::before": {
            content: '""',
            width: 36,
            height: 4,
            flexShrink: 0,
            alignSelf: "center",
            mt: 1,
            borderRadius: "100px",
            backgroundColor: "fill.muted",
        },
    },
};
