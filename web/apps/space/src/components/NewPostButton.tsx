import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import React from "react";
import { useSpaceAppState } from "state/app-state";

const green = "#08C225";

export const spaceNewPostButtonSize = 28;
export const spaceNewPostButtonRadius = spaceNewPostButtonSize / 2;

export const SpaceNewPostButton: React.FC<{
    isDisabled?: boolean;
    onClick: () => void;
}> = ({ isDisabled = false, onClick }) => {
    const { postPublication } = useSpaceAppState();
    const disabled = isDisabled || postPublication?.phase == "posting";

    return (
        <Box
            className="green-bg"
            component="button"
            type="button"
            aria-label="New post"
            disabled={disabled}
            onClick={onClick}
            sx={{
                alignItems: "center",
                appearance: "none",
                bgcolor: green,
                border: 0,
                borderRadius: `${spaceNewPostButtonRadius}px`,
                color: "#FFFFFF",
                cursor: disabled ? "default" : "pointer",
                display: "flex",
                flexShrink: 0,
                height: spaceNewPostButtonSize,
                justifyContent: "center",
                opacity: disabled ? 0.6 : 1,
                p: 0,
                width: spaceNewPostButtonSize,
                "&:hover:not(:disabled)": { bgcolor: "#07B422" },
                "&:focus-visible": {
                    outline: `2px solid ${green}`,
                    outlineOffset: 3,
                },
            }}
        >
            <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2} />
        </Box>
    );
};
