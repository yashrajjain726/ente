import { keyframes } from "@emotion/react";
import { Box } from "@mui/material";
import type { LoadingBarController } from "ente-base/components/utils/use-loading-bar";
import React, { useImperativeHandle, useState } from "react";

interface ThemedLoadingBarProps {
    ref: React.Ref<LoadingBarController>;
}

const loadingBarProgress = keyframes({
    from: { transform: "scaleX(0)" },
    to: { transform: "scaleX(0.9)" },
});

export function ThemedLoadingBar({
    ref,
}: ThemedLoadingBarProps): React.JSX.Element {
    const [isRunning, setIsRunning] = useState(false);

    useImperativeHandle(ref, () => ({
        continuousStart: () => setIsRunning(true),
        complete: () => setIsRunning(false),
    }));

    return (
        <Box
            aria-hidden={!isRunning}
            role="progressbar"
            sx={{
                animation: isRunning
                    ? `${loadingBarProgress} 10s ease-out forwards`
                    : "none",
                bgcolor: "accent.main",
                height: "2px",
                left: 0,
                opacity: isRunning ? 1 : 0,
                pointerEvents: "none",
                position: "fixed",
                top: 0,
                transform: isRunning ? "scaleX(0)" : "scaleX(1)",
                transformOrigin: "left",
                transition: !isRunning
                    ? "transform 200ms ease-out, opacity 150ms ease-out 200ms"
                    : "none",
                width: "100%",
                zIndex: "calc(var(--mui-zIndex-tooltip) + 1)",
            }}
        />
    );
}
