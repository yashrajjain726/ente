import { Box } from "@mui/material";
import React from "react";
import { spaceTouchTargetSize } from "styles/touchTargets";

const green = "#08C225";
const editButtonVisualSize = 30;

const PencilIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
    >
        <path
            d="M14.25 5.25L18.75 9.75M4.75 19.25L8.9 18.45L19.35 8C20.25 7.1 20.25 5.65 19.35 4.75C18.45 3.85 17 3.85 16.1 4.75L5.65 15.2L4.75 19.25Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
    </Box>
);

interface SpaceAvatarEditButtonProps {
    ariaLabel?: string;
    disabled?: boolean;
    onClick?: () => void;
}

export const SpaceAvatarEditButton: React.FC<SpaceAvatarEditButtonProps> = ({
    ariaLabel = "Edit profile picture",
    disabled = false,
    onClick,
}) => (
    <Box
        component="button"
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: "transparent",
            border: 0,
            borderRadius: "50%",
            bottom: 3,
            color: "white",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            height: spaceTouchTargetSize,
            justifyContent: "center",
            position: "absolute",
            right: -5,
            width: spaceTouchTargetSize,
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 3,
            },
        }}
    >
        <Box
            className="green-bg"
            component="span"
            sx={{
                alignItems: "center",
                bgcolor: green,
                borderRadius: "50%",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                display: "flex",
                height: editButtonVisualSize,
                justifyContent: "center",
                width: editButtonVisualSize,
            }}
        >
            <PencilIcon />
        </Box>
    </Box>
);
