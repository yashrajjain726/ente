import {
    Dialog,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import type { LocalUser } from "ente-accounts-rs/services/user";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import {
    useModalVisibility,
    type ModalVisibilityProps,
} from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import {
    maxAlbumDescriptionLength,
    type Collection,
} from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";
import { ItemCard, PreviewItemTile } from "ente-new/photos/components/Tiles";
import { albumDescriptionGraphemeCount } from "ente-new/photos/services/collection";
import { useFormik } from "formik";
import { t } from "i18next";
import React, { useId, useState } from "react";
import { PickCoverPhotoDialog } from "./PickCoverPhotoDialog";

export interface AlbumDetails {
    name: string;
    description: string;
    /** Undefined when untouched; zero resets to the default cover. */
    coverID?: number;
}

type EditAlbumDetailsDialogProps = ModalVisibilityProps & {
    collection: Collection;
    files: EnteFile[];
    initialCoverFile: EnteFile | undefined;
    user: LocalUser;
    onSubmit: (details: AlbumDetails) => Promise<void>;
};

export const EditAlbumDetailsDialog: React.FC<EditAlbumDetailsDialogProps> = ({
    open,
    onClose,
    collection,
    files,
    initialCoverFile,
    user,
    onSubmit,
}) => {
    const { showMiniDialog, onGenericError } = useBaseContext();
    const titleID = useId();
    const { show: showPickCoverPhoto, props: pickCoverPhotoVisibilityProps } =
        useModalVisibility();
    const [pendingCoverID, setPendingCoverID] = useState<number>();
    const initialName = collection.name;
    const initialDescription = collection.pubMagicMetadata?.data.caption ?? "";
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
                await onSubmit({ name, description, coverID: pendingCoverID });
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
        trimmedName != initialName ||
        trimmedDescription != initialDescription.trim() ||
        pendingCoverID !== undefined;
    const isSaveDisabled =
        !trimmedName ||
        isDescriptionTooLong ||
        !hasChanges ||
        formik.isSubmitting;

    const handleClose = () => {
        if (formik.isSubmitting || pickCoverPhotoVisibilityProps.open) return;
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

    const handleUseSelectedPhoto = (file: EnteFile) => {
        setPendingCoverID(file.id);
        return Promise.resolve(true);
    };

    const handleResetToDefault = () => {
        setPendingCoverID(0);
        return Promise.resolve(true);
    };

    const canShowCoverEditor = files.some(
        (file) => file.metadata.fileType !== FileType.video,
    );
    const effectiveCoverID =
        pendingCoverID ?? collection.pubMagicMetadata?.data.coverID ?? 0;
    const effectiveCoverFile =
        pendingCoverID === undefined
            ? initialCoverFile
            : pendingCoverID > 0
              ? files.find(({ id }) => id === pendingCoverID)
              : collection.pubMagicMetadata?.data.asc
                ? files.at(-1)
                : files[0];

    return (
        <>
            <Dialog
                open={open}
                onClose={
                    pickCoverPhotoVisibilityProps.open ? undefined : handleClose
                }
                aria-labelledby={titleID}
                maxWidth="xs"
                fullWidth
                slotProps={{ paper: { sx: { p: "8px 4px 4px 4px" } } }}
            >
                <DialogTitle id={titleID}>{t("edit_details")}</DialogTitle>
                <DialogContent sx={{ "&&&": { pt: 0 } }}>
                    <Stack component="form" onSubmit={formik.handleSubmit}>
                        {canShowCoverEditor && (
                            <Stack
                                direction="row"
                                sx={{ alignItems: "center", gap: 2, mt: 2 }}
                            >
                                <ItemCard
                                    key={effectiveCoverFile?.id}
                                    TileComponent={PreviewItemTile}
                                    coverFile={effectiveCoverFile}
                                />
                                <Typography sx={{ flex: 1, minWidth: 0 }}>
                                    {t("album_cover")}
                                </Typography>
                                <FocusVisibleButton
                                    type="button"
                                    color="secondary"
                                    disabled={formik.isSubmitting}
                                    onClick={showPickCoverPhoto}
                                >
                                    {t("set_cover")}
                                </FocusVisibleButton>
                            </Stack>
                        )}
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
            {canShowCoverEditor && (
                <PickCoverPhotoDialog
                    {...pickCoverPhotoVisibilityProps}
                    collection={collection}
                    files={files}
                    user={user}
                    canResetToDefault={effectiveCoverID > 0}
                    onUseSelectedPhoto={handleUseSelectedPhoto}
                    onResetToDefault={handleResetToDefault}
                />
            )}
        </>
    );
};
