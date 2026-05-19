import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import React from "react";

export const socialActionDoneDurationMs = 2400;
export const socialActionTransition = "220ms cubic-bezier(0.4, 0, 0.2, 1)";

export type SocialActionPhase = "busy" | "done";

const socialActionSpin = keyframes`
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
`;

interface SocialActionFeedbackIconProps {
    idleIcon?: React.ReactNode;
    phase: SocialActionPhase | null;
    size?: number;
}

export const SocialActionFeedbackIcon: React.FC<
    SocialActionFeedbackIconProps
> = ({ idleIcon, phase, size = 18 }) => {
    const statusIconSize = size == 18 ? 22 : size;

    return (
        <Box
            component="span"
            sx={{
                display: "grid",
                height: size,
                lineHeight: 0,
                placeItems: "center",
                width: size,
            }}
        >
            {idleIcon && (
                <Box
                    component="span"
                    sx={{
                        display: "flex",
                        gridArea: "1 / 1",
                        lineHeight: 0,
                        opacity: phase == null ? 1 : 0,
                        transform: phase == null ? "scale(1)" : "scale(0.82)",
                        transition:
                            phase == "busy"
                                ? "none"
                                : `opacity ${socialActionTransition}, transform ${socialActionTransition}`,
                    }}
                >
                    {idleIcon}
                </Box>
            )}
            <Box
                component="span"
                sx={{
                    display: "flex",
                    gridArea: "1 / 1",
                    lineHeight: 0,
                    opacity: phase == "busy" ? 1 : 0,
                    transform: phase == "busy" ? "scale(1)" : "scale(0.82)",
                    transition:
                        phase == "busy"
                            ? "none"
                            : `opacity ${socialActionTransition}, transform ${socialActionTransition}`,
                }}
            >
                <Box
                    component="span"
                    sx={{
                        animation: `${socialActionSpin} 2.4s linear infinite`,
                        display: "flex",
                        lineHeight: 0,
                    }}
                >
                    <HugeiconsIcon
                        icon={Loading03Icon}
                        size={statusIconSize}
                        strokeWidth={1.8}
                    />
                </Box>
            </Box>
            <Box
                component="span"
                sx={{
                    display: "flex",
                    gridArea: "1 / 1",
                    lineHeight: 0,
                    opacity: phase == "done" ? 1 : 0,
                    transform: phase == "done" ? "scale(1)" : "scale(0.82)",
                    transition: `opacity ${socialActionTransition}, transform ${socialActionTransition}`,
                }}
            >
                <HugeiconsIcon
                    icon={Tick02Icon}
                    size={statusIconSize}
                    strokeWidth={1.8}
                />
            </Box>
        </Box>
    );
};
