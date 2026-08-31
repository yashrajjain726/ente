import { Box } from "@mui/material";
import React from "react";

export const SpacePostUnreadBadge: React.FC<{ count: number }> = ({
    count,
}) => (
    <Box
        component="span"
        aria-hidden
        sx={{
            alignItems: "center",
            bgcolor: "#F63A3A",
            borderRadius: "999px",
            color: "#FFFFFF",
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
            right: "8%",
            top: "8%",
            whiteSpace: "nowrap",
            zIndex: 1,
        }}
    >
        {count}
    </Box>
);
