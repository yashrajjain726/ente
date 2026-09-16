import { Box } from "@mui/material";
import React from "react";

const captionBubbleSx = {
    borderRadius: "5px",
    boxDecorationBreak: "clone",
    px: "10px",
    py: "4px",
    WebkitBoxDecorationBreak: "clone",
} as const;

export const SpaceCaptionText: React.FC<{
    caption: string;
    lineClamp?: number;
}> = ({ caption, lineClamp }) => {
    const layerSx = {
        display: "-webkit-box",
        gridArea: "1 / 1",
        minWidth: 0,
        overflow: lineClamp ? "hidden" : undefined,
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lineClamp,
    } as const;

    return (
        <Box component="span" sx={{ display: "grid" }}>
            <Box
                component="span"
                aria-hidden
                sx={{ ...layerSx, color: "transparent", opacity: 0.85 }}
            >
                <Box
                    component="span"
                    sx={{ ...captionBubbleSx, bgcolor: "#202020" }}
                >
                    <Box component="span" sx={{ opacity: 0 }}>
                        {caption}
                    </Box>
                </Box>
            </Box>
            <Box component="span" sx={{ ...layerSx, zIndex: 1 }}>
                <Box component="span" sx={captionBubbleSx}>
                    {caption}
                </Box>
            </Box>
        </Box>
    );
};
