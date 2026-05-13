import { Box } from "@mui/material";
import { SocialPageMeta } from "components/SocialPageMeta";
import React from "react";

interface SocialRouteFallbackProps {
    background: string;
}

export const SocialRouteFallback: React.FC<SocialRouteFallbackProps> = ({
    background,
}) => (
    <>
        <SocialPageMeta themeColor={background} />
        <Box sx={{ bgcolor: background, minHeight: "100svh" }} />
    </>
);
