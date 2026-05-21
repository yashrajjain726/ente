import { Box } from "@mui/material";
import { SpacePageMeta } from "components/SpacePageMeta";
import React from "react";

interface SpaceRouteFallbackProps {
    actionLabel?: string;
    background: string;
    message?: string;
    onAction?: () => void;
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
    actionLabel,
    background,
    message,
    onAction,
}) => (
    <>
        <SpacePageMeta themeColor={background} />
        <Box
            sx={{
                alignItems: "center",
                bgcolor: background,
                display: "grid",
                minHeight: "100svh",
                placeItems: "center",
                px: 3,
                textAlign: "center",
            }}
        >
            {message ? (
                <Box sx={{ maxWidth: 300 }}>
                    <Box
                        role="alert"
                        sx={{
                            color: "#111111",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: "20px",
                        }}
                    >
                        {message}
                    </Box>
                    {actionLabel && onAction && (
                        <Box
                            component="button"
                            type="button"
                            onClick={onAction}
                            sx={{
                                bgcolor: "#08C225",
                                border: 0,
                                borderRadius: "18px",
                                color: "white",
                                cursor: "pointer",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 700,
                                height: 36,
                                lineHeight: "18px",
                                mt: 2,
                                px: "16px",
                            }}
                        >
                            {actionLabel}
                        </Box>
                    )}
                </Box>
            ) : (
                <SpaceLoadingSpinner />
            )}
        </Box>
    </>
);
