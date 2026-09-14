import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import React from "react";
import { useSpaceAppState } from "state/app-state";

const green = "#08C225";

export const spaceNewPostButtonSize = 44;
export const spaceNewPostButtonRadius = 12;

export const SpaceNewPostButton: React.FC<{
    isDisabled?: boolean;
    label?: string;
    onClick: () => void;
}> = ({ isDisabled = false, label, onClick }) => {
    const { postPublication } = useSpaceAppState();
    const disabled = isDisabled || postPublication?.phase == "posting";

    return (
        <Box
            component="button"
            type="button"
            aria-label={label ?? "New post"}
            disabled={disabled}
            onClick={onClick}
            sx={{
                alignItems: "center",
                appearance: "none",
                bgcolor: "#232326",
                border: 0,
                borderRadius: `${spaceNewPostButtonRadius}px`,
                color: "#FFFFFF",
                cursor: disabled ? "default" : "pointer",
                display: "flex",
                flexShrink: 0,
                font: "inherit",
                fontSize: 12,
                height: spaceNewPostButtonSize,
                justifyContent: "center",
                lineHeight: "18px",
                opacity: disabled ? 0.6 : 1,
                p: 0,
                "&:hover:not(:disabled) .green-bg": {
                    filter: "brightness(0.96)",
                },
                "&:focus-visible": {
                    outline: `2px solid ${green}`,
                    outlineOffset: 3,
                },
            }}
        >
            {label && (
                <Box component="span" sx={{ px: "16px", whiteSpace: "nowrap" }}>
                    {label}
                </Box>
            )}
            <Box
                className="green-bg"
                component="span"
                sx={{
                    alignItems: "center",
                    bgcolor: green,
                    borderRadius: "inherit",
                    display: "flex",
                    flexShrink: 0,
                    height: "100%",
                    justifyContent: "center",
                    width: spaceNewPostButtonSize,
                }}
            >
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2} />
            </Box>
        </Box>
    );
};
