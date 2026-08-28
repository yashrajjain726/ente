import { Box } from "@mui/material";
import React from "react";
import type { HomeOrbitPlacement } from "utils/home-orbit-layout";

const green = "#08C225";

interface SpaceHomeOrbitProps {
    children: React.ReactNode;
    hasNewPost: boolean;
    placement: HomeOrbitPlacement;
}

export const SpaceHomeOrbit = React.forwardRef<
    HTMLLIElement,
    SpaceHomeOrbitProps
>(function SpaceHomeOrbit({ children, hasNewPost, placement }, ref) {
    return (
        <Box
            ref={ref}
            component="li"
            sx={{
                height: placement.radius,
                left: "50%",
                listStyle: "none",
                position: "absolute",
                top: placement.top,
                transform: "translateX(-50%)",
                transition:
                    "height 320ms ease, top 320ms ease, width 320ms ease",
                width: placement.radius * 2,
                "@media (prefers-reduced-motion: reduce)": {
                    transition: "none",
                },
            }}
        >
            <Box
                component="svg"
                aria-hidden
                viewBox={`0 0 ${placement.radius * 2} ${placement.radius}`}
                sx={{
                    height: "100%",
                    inset: 0,
                    overflow: "visible",
                    pointerEvents: "none",
                    position: "absolute",
                    width: "100%",
                }}
            >
                <Box
                    component="path"
                    d={`M 0 ${placement.radius} A ${placement.radius} ${placement.radius} 0 0 1 ${placement.radius * 2} ${placement.radius}`}
                    fill="none"
                    stroke={hasNewPost ? green : "rgba(255, 255, 255, 0.16)"}
                    strokeWidth={hasNewPost ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                    sx={{ transition: "stroke 180ms ease" }}
                />
            </Box>
            <Box
                sx={{
                    height: placement.avatarSize,
                    left: "50%",
                    position: "absolute",
                    top: 0,
                    transform: "translate(-50%, -50%)",
                    transition: "height 320ms ease, width 320ms ease",
                    width: placement.avatarSize,
                    zIndex: 1,
                    "@media (prefers-reduced-motion: reduce)": {
                        transition: "none",
                    },
                }}
            >
                {children}
            </Box>
        </Box>
    );
});
