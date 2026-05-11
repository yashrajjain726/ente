import { Box, Dialog } from "@mui/material";
import React from "react";

const green = "#08C225";
const dangerColor = "#F63A3A";
const textBase = "#000";

interface ConfirmationActionSheetProps {
    open: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
}

export const ConfirmationActionSheet: React.FC<
    ConfirmationActionSheetProps
> = ({
    open,
    title,
    confirmLabel,
    cancelLabel = "Cancel",
    onCancel,
    onConfirm,
}) => {
    const titleID = React.useId();

    return (
        <Dialog
            open={open}
            onClose={onCancel}
            maxWidth={false}
            aria-labelledby={titleID}
            slotProps={{
                backdrop: {
                    sx: { backgroundColor: "rgba(0, 0, 0, 0.48)" },
                },
                paper: {
                    sx: {
                        bgcolor: "#FAFAFA",
                        borderRadius: "20px 20px 0 0",
                        bottom: 0,
                        boxShadow: "none",
                        boxSizing: "border-box",
                        left: "50%",
                        m: 0,
                        p: "26px 20px 24px",
                        position: "fixed",
                        transform: "translateX(-50%)",
                        width: "calc(100vw - 12px)",
                        maxWidth: 363,
                    },
                },
            }}
        >
            <Box
                component="h2"
                id={titleID}
                sx={{
                    color: textBase,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 15,
                    fontWeight: 600,
                    lineHeight: "20px",
                    m: 0,
                    px: "20px",
                    textAlign: "center",
                }}
            >
                {title}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    mt: "28px",
                }}
            >
                <SheetButton
                    label={confirmLabel}
                    backgroundColor={dangerColor}
                    color="#FFFFFF"
                    onClick={onConfirm}
                />
                <SheetButton
                    label={cancelLabel}
                    backgroundColor="#F2F2F2"
                    color="#666666"
                    onClick={onCancel}
                />
            </Box>
        </Dialog>
    );
};

interface SheetButtonProps {
    backgroundColor: string;
    color: string;
    label: string;
    onClick: () => void;
}

const SheetButton: React.FC<SheetButtonProps> = ({
    backgroundColor,
    color,
    label,
    onClick,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: backgroundColor,
            border: 0,
            borderRadius: "20px",
            color,
            cursor: "pointer",
            display: "flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            height: 48,
            justifyContent: "center",
            lineHeight: "20px",
            px: "24px",
            py: "14px",
            transition: "filter 120ms ease, opacity 120ms ease",
            width: "100%",
            "&:active": { filter: "brightness(0.96)" },
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
            "&:hover": { filter: "brightness(0.98)" },
        }}
    >
        {label}
    </Box>
);
