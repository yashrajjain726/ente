import { Box } from "@mui/material";
import React from "react";

interface SpacePostBadgeProps extends React.PropsWithChildren {
    backgroundColor: string;
    color: string;
    placement?: "center" | "top-right";
}

export const SpacePostBadge: React.FC<SpacePostBadgeProps> = ({
    backgroundColor,
    children,
    color,
    placement = "top-right",
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
            fontSize: placement == "center" ? 14 : 10,
            fontVariantNumeric: "tabular-nums",
            fontWeight: placement == "center" ? 500 : 700,
            height: placement == "center" ? 24 : 20,
            justifyContent: "center",
            lineHeight: 1,
            minWidth: 20,
            pointerEvents: "none",
            position: "absolute",
            px: placement == "center" ? "10px" : "7px",
            whiteSpace: "nowrap",
            zIndex: 1,
            ...(placement == "center"
                ? {
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                  }
                : { right: "10%", top: "10%" }),
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
