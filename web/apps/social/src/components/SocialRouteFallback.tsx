import { Box } from "@mui/material";
import { SocialPageMeta } from "components/SocialPageMeta";
import React from "react";

interface SocialRouteFallbackProps {
    background: string;
}

interface SocialLoadingSpinnerProps {
    ariaLabel?: string;
}

export const SocialLoadingSpinner: React.FC<SocialLoadingSpinnerProps> = ({
    ariaLabel = "Loading",
}) => (
    <Box
        component="span"
        role="status"
        aria-label={ariaLabel}
        sx={{
            animation: "socialRouteFallbackSpin 800ms linear infinite",
            border: "3px solid rgba(8, 194, 37, 0.18)",
            borderRadius: "50%",
            borderTopColor: "#08C225",
            height: 32,
            width: 32,
            "@keyframes socialRouteFallbackSpin": {
                to: { transform: "rotate(360deg)" },
            },
        }}
    />
);

export const SocialRouteFallback: React.FC<SocialRouteFallbackProps> = ({
    background,
}) => (
    <>
        <SocialPageMeta themeColor={background} />
        <Box
            sx={{
                bgcolor: background,
                display: "grid",
                minHeight: "100svh",
                placeItems: "center",
            }}
        >
            <SocialLoadingSpinner />
        </Box>
    </>
);
