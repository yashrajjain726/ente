import { lockerDialogPaperSx } from "@/components/locker-dialog-styles";
import {
    lockerColorSx,
    lockerTextBodyBoldSx,
    lockerTextBodySx,
    lockerTextH2Sx,
    lockerTextMiniSx,
} from "@/components/locker-tokens";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Dialog, IconButton, Stack, Typography } from "@mui/material";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { t } from "i18next";

export interface EmptyTrashDialogState {
    loading: boolean;
    error?: string;
}

interface EmptyTrashDialogProps {
    dialogState: EmptyTrashDialogState | null;
    visibleDialogState: EmptyTrashDialogState | null;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
}

export function EmptyTrashDialog({
    dialogState,
    visibleDialogState,
    onClose,
    onConfirm,
}: EmptyTrashDialogProps) {
    const handleClose = () => {
        if (!dialogState?.loading) {
            onClose();
        }
    };

    return (
        <Dialog
            open={dialogState !== null}
            onClose={handleClose}
            fullWidth
            maxWidth="xs"
            slotProps={{
                paper: {
                    sx: (theme) => ({
                        ...lockerDialogPaperSx,
                        borderRadius: "24px",
                        width: "min(100%, 440px)",
                        padding: "20px",
                        ...lockerColorSx(theme, {
                            backgroundColor: "backgroundBase",
                        }),
                    }),
                },
            }}
        >
            <Stack>
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <IconButton
                        aria-label={t("cancel")}
                        onClick={handleClose}
                        disabled={visibleDialogState?.loading}
                        sx={(theme) => ({
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            padding: 0,
                            ...lockerColorSx(theme, {
                                backgroundColor: "fillLight",
                                color: "iconColor",
                            }),
                            "&:hover": {
                                ...lockerColorSx(theme, {
                                    backgroundColor: "fillDark",
                                }),
                            },
                        })}
                    >
                        <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={18}
                            strokeWidth={1.5}
                        />
                    </IconButton>
                </Box>
                <img
                    src="/images/collection_delete_icon.png"
                    srcSet="/images/collection_delete_icon@2x.png 2x, /images/collection_delete_icon@3x.png 3x"
                    alt=""
                    style={{
                        width: 120,
                        height: 120,
                        objectFit: "contain",
                        display: "block",
                        margin: "4px auto 0",
                    }}
                />
                <Typography
                    sx={{ ...lockerTextH2Sx, textAlign: "center", mt: 2.5 }}
                >
                    {t("empty_trash_title")}
                </Typography>
                <Typography
                    sx={(theme) => ({
                        ...lockerTextBodySx,
                        textAlign: "center",
                        mt: 1.5,
                        ...lockerColorSx(theme, { color: "textLight" }),
                    })}
                >
                    {t("empty_trash_message")}
                </Typography>
                {visibleDialogState?.error && (
                    <Typography
                        sx={(theme) => ({
                            ...lockerTextMiniSx,
                            textAlign: "center",
                            mt: 1.5,
                            ...lockerColorSx(theme, { color: "warning" }),
                        })}
                    >
                        {visibleDialogState.error}
                    </Typography>
                )}
                <LoadingButton
                    fullWidth
                    color="critical"
                    loading={visibleDialogState?.loading}
                    onClick={onConfirm}
                    sx={(theme) => ({
                        ...lockerTextBodyBoldSx,
                        mt: 3,
                        minHeight: 52,
                        borderRadius: "20px",
                        textTransform: "none",
                        ...lockerColorSx(theme, {
                            backgroundColor: "warning",
                            color: "specialWhite",
                        }),
                        "&:hover": {
                            ...lockerColorSx(theme, {
                                backgroundColor: "warningDark",
                            }),
                        },
                        "&.Mui-disabled": {
                            ...lockerColorSx(theme, {
                                backgroundColor: "warning",
                                color: "specialWhite",
                            }),
                        },
                    })}
                >
                    {t("empty_trash")}
                </LoadingButton>
            </Stack>
        </Dialog>
    );
}
