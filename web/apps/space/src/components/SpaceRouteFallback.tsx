import { Box } from "@mui/material";
import { SpacePageMeta } from "components/SpacePageMeta";
import React from "react";

interface SpaceRouteFallbackProps {
    background: string;
}

interface SpaceLoadingSpinnerProps {
    ariaLabel?: string;
}

export const SpaceLoadingSpinner: React.FC<SpaceLoadingSpinnerProps> = ({
    ariaLabel = "Loading",
}) => (
    <Box
        component="span"
        role="status"
        aria-label={ariaLabel}
        sx={{
            animation: "spaceRouteFallbackSpin 800ms linear infinite",
            border: "2px solid rgba(8, 194, 37, 0.18)",
            borderRadius: "50%",
            borderTopColor: "#08C225",
            height: 26,
            width: 26,
            "@keyframes spaceRouteFallbackSpin": {
                to: { transform: "rotate(360deg)" },
            },
        }}
    />
);

export const SpaceRouteFallback: React.FC<SpaceRouteFallbackProps> = ({
    background,
}) => (
    <>
        <SpacePageMeta themeColor={background} />
        <Box
            sx={{
                bgcolor: background,
                display: "grid",
                minHeight: "100svh",
                placeItems: "center",
            }}
        >
            <SpaceLoadingSpinner />
        </Box>
    </>
);
