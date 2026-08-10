import { useTheme } from "@mui/material";
import type { LoadingBarController } from "ente-base/components/utils/use-loading-bar";
import React from "react";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";

interface ThemedLoadingBarProps {
    ref: React.Ref<LoadingBarController>;
}

export const ThemedLoadingBar: React.FC<ThemedLoadingBarProps> = ({ ref }) => {
    const theme = useTheme();

    return (
        <LoadingBar
            color={theme.vars.palette.accent.main}
            ref={ref as React.Ref<LoadingBarRef>}
        />
    );
};
