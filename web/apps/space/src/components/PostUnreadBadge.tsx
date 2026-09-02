import { Box } from "@mui/material";
import React from "react";

interface SpacePostBadgeProps extends React.PropsWithChildren {
    backgroundColor: string;
    color: string;
}

export const SpacePostBadge: React.FC<SpacePostBadgeProps> = ({
    backgroundColor,
    children,
    color,
}) => (
    <Box
        component="span"
        aria-hidden
        sx={{
            alignItems: "center",
            bgcolor: backgroundColor,
            borderRadius: "999px",
            color,
            display: "inline-flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            height: 20,
            justifyContent: "center",
            lineHeight: 1,
            minWidth: 20,
            pointerEvents: "none",
            position: "absolute",
            px: "7px",
            right: "10%",
            top: "10%",
            whiteSpace: "nowrap",
            zIndex: 1,
        }}
    >
        {children}
    </Box>
);

export const SpacePostUnreadBadge: React.FC<{ count: number }> = ({
    count,
}) => (
    <SpacePostBadge backgroundColor="#F63A3A" color="#FFFFFF">
        {count}
    </SpacePostBadge>
);
