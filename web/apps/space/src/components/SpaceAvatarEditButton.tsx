import { Box } from "@mui/material";
import React from "react";

const green = "#08C225";
const textBase = "#000";

const PencilIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 16, width: 16 }}
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
            bgcolor: "white",
            border: 0,
            borderRadius: "50%",
            bottom: 10,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
            color: textBase,
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            height: 26,
            justifyContent: "center",
            position: "absolute",
            right: 2,
            width: 26,
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 3,
            },
        }}
    >
        <PencilIcon />
    </Box>
);
