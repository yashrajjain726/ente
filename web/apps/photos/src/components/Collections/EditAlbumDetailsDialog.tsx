import {
    Dialog,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
} from "@mui/material";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { maxAlbumDescriptionLength } from "ente-media/collection";
import { albumDescriptionGraphemeCount } from "ente-new/photos/services/collection";
import { useFormik } from "formik";
import { t } from "i18next";
import React, { useId } from "react";

export interface AlbumDetails {
    name: string;
    description: string;
}

type EditAlbumDetailsDialogProps = ModalVisibilityProps & {
    initialName: string;
    initialDescription: string;
    onSubmit: (details: AlbumDetails) => Promise<void>;
};

export const EditAlbumDetailsDialog: React.FC<EditAlbumDetailsDialogProps> = ({
    open,
    onClose,
    initialName,
    initialDescription,
    onSubmit,
}) => {
    const { showMiniDialog, onGenericError } = useBaseContext();
    const titleID = useId();
    const formik = useFormik<AlbumDetails>({
        initialValues: { name: initialName, description: initialDescription },
        onSubmit: async ({
            name: untrimmedName,
            description: untrimmedDescription,
        }) => {
            const name = untrimmedName.trim();
            const description = untrimmedDescription.trim();
            const descriptionLength =
                albumDescriptionGraphemeCount(description);
            if (!name || descriptionLength > maxAlbumDescriptionLength) return;
            try {
                await onSubmit({ name, description });
                onClose();
            } catch (e) {
                onGenericError(e);
            }
        },
    });

    const trimmedName = formik.values.name.trim();
    const trimmedDescription = formik.values.description.trim();
    const descriptionLength = albumDescriptionGraphemeCount(trimmedDescription);
    const isDescriptionTooLong = descriptionLength > maxAlbumDescriptionLength;
    const hasChanges =
        trimmedName != initialName.trim() ||
        trimmedDescription != initialDescription.trim();
    const isSaveDisabled =
        !trimmedName ||
        isDescriptionTooLong ||
        !hasChanges ||
        formik.isSubmitting;

    const handleClose = () => {
        if (formik.isSubmitting) return;
        if (hasChanges) {
            showMiniDialog({
                title: t("discard_changes"),
                message: t("discard_changes_confirm_message"),
                continue: {
                    text: t("discard"),
                    color: "critical",
                    action: onClose,
                },
            });
            return;
        }
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            aria-labelledby={titleID}
            maxWidth="xs"
            fullWidth
            slotProps={{ paper: { sx: { p: "8px 4px 4px 4px" } } }}
        >
            <DialogTitle id={titleID}>{t("edit_details")}</DialogTitle>
            <DialogContent sx={{ "&&&": { pt: 0 } }}>
                <Stack component="form" onSubmit={formik.handleSubmit}>
                    <TextField
                        name="name"
                        value={formik.values.name}
                        onChange={formik.handleChange}
                        label={t("album_name")}
                        autoFocus
                        fullWidth
                        margin="normal"
                        disabled={formik.isSubmitting}
                        error={!trimmedName}
                        helperText={!trimmedName ? t("required") : " "}
                    />
                    <TextField
                        name="description"
                        value={formik.values.description}
                        onChange={formik.handleChange}
                        label={t("description")}
                        placeholder={t("caption_placeholder")}
                        multiline
                        minRows={5}
                        fullWidth
                        disabled={formik.isSubmitting}
                        error={isDescriptionTooLong}
                        helperText={`${descriptionLength}/${maxAlbumDescriptionLength}`}
                    />
                    <Stack direction="row" sx={{ gap: "12px", mt: 3 }}>
                        <FocusVisibleButton
                            type="button"
                            fullWidth
                            color="secondary"
                            disabled={formik.isSubmitting}
                            onClick={handleClose}
                        >
                            {t("cancel")}
                        </FocusVisibleButton>
                        <LoadingButton
                            type="submit"
                            fullWidth
                            color="primary"
                            loading={formik.isSubmitting}
                            disabled={isSaveDisabled}
                        >
                            {t("save_changes")}
                        </LoadingButton>
                    </Stack>
                </Stack>
            </DialogContent>
        </Dialog>
    );
};
