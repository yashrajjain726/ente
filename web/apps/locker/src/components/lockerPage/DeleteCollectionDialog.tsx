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
import {
    Box,
    Checkbox,
    Dialog,
    FormControlLabel,
    IconButton,
    Stack,
    Typography,
} from "@mui/material";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { t } from "i18next";
import React from "react";
import type { DeleteCollectionDialogState } from "./use-locker-actions";

interface DeleteCollectionDialogProps {
    dialogState: DeleteCollectionDialogState | null;
    visibleDialogState: DeleteCollectionDialogState | null;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
    onToggleDeleteFromEverywhere: (checked: boolean) => void;
}

export const DeleteCollectionDialog: React.FC<DeleteCollectionDialogProps> = ({
    dialogState,
    visibleDialogState,
    onClose,
    onConfirm,
    onToggleDeleteFromEverywhere,
}) => (
    <Dialog
        open={dialogState !== null}
        onClose={() => {
            if (!dialogState?.loading) {
                onClose();
            }
        }}
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
                    onClick={onClose}
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
                {t("deleteCollectionTitle")}
            </Typography>
            <Typography
                sx={(theme) => ({
                    ...lockerTextBodySx,
                    textAlign: "center",
                    mt: 1.5,
                    ...lockerColorSx(theme, { color: "textLight" }),
                })}
            >
                {t("deleteCollectionDialogBody", {
                    collectionName: visibleDialogState?.collectionName ?? "",
                })}
            </Typography>
            {visibleDialogState?.hasItems && (
                <Box
                    sx={{ display: "flex", mt: 2.5, justifyContent: "center" }}
                >
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={
                                    visibleDialogState.deleteFromEverywhere
                                }
                                disabled={visibleDialogState.loading}
                                onChange={(event) =>
                                    onToggleDeleteFromEverywhere(
                                        event.target.checked,
                                    )
                                }
                            />
                        }
                        label={t("deleteCollectionFromEverywhere")}
                        sx={{
                            alignItems: "center",
                            m: 0,
                            "& .MuiFormControlLabel-label": lockerTextBodySx,
                        }}
                    />
                </Box>
            )}
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
                {t("delete")}
            </LoadingButton>
        </Stack>
    </Dialog>
);
