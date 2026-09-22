import { Box } from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { spaceAppBackgroundColor, spaceText } from "styles/colors";

export const SpaceSkipLink = () => (
    <Box
        component="a"
        href="#space-main-content"
        onClick={(event) => {
            event.preventDefault();
            document.getElementById("space-main-content")?.focus();
        }}
        sx={{
            bgcolor: spaceText,
            borderRadius: "8px",
            color: spaceAppBackgroundColor,
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            left: "8px",
            p: "12px 16px",
            position: "fixed",
            top: "calc(env(safe-area-inset-top) + 8px)",
            zIndex: 1200,
            "&:not(:focus)": visuallyHidden,
        }}
    >
        Skip to main content
    </Box>
);
