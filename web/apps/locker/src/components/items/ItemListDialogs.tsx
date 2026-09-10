import { FormField } from "@/components/ui/FormField";
import { LockerMenuFooter, LockerMenuOption } from "@/components/ui/LockerMenu";
import { lockerMenuPaperSx } from "@/styles/dialog";
import {
    lockerHeaderIconButtonSx,
    lockerPrimaryButtonSx,
} from "@/styles/fields";
import {
    lockerColorSx,
    lockerTextBodyBoldSx,
    lockerTextBodySx,
    lockerTextH2Sx,
    lockerTextMiniSx,
} from "@/styles/tokens";
import type { LockerCollection } from "@/types";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import {
    Box,
    Chip,
    Dialog,
    IconButton,
    Menu,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { t } from "i18next";
import React, { useId } from "react";
import {
    lockerSheetContainerSx,
    lockerSheetPaperSx,
} from "../../styles/dialog";
import { LockerConfirmDialog } from "../ui/LockerConfirmDialog";
import { LockerFileLinkDialog } from "./LockerFileLinkDialog";

interface ItemListDialogsProps {
    activeFileLinkItemTitle: string;
    activeFileLinkURL: string | null;
    canNativeShare: boolean;
    closeCollectionFilterMenu: () => void;
    closeFileLinkDialog: () => void;
    clearHomeCollectionSelection: () => void;
    createCollectionError: string | null;
    createCollectionName: string;
    createCollectionOpen: boolean;
    creatingCollection: boolean;
    deleteFileLink: () => void;
    dropdownHomeCollections: LockerCollection[];
    feedbackMessage: string | null;
    homeSelectedCollectionIDs: number[];
    isCreatingFileLink: boolean;
    isDeleteFileLinkConfirmOpen: boolean;
    isDeletingFileLink: boolean;
    onCloseFeedback: () => void;
    onCloseRenameDialog: () => void;
    onCloseRestoreDialog: () => void;
    onCloseCreateCollectionDialog: () => void;
    onConfirmCreateCollection: () => void;
    onConfirmRename: () => void | Promise<void>;
    onConfirmRestore: () => void | Promise<void>;
    onCopyFileLink: () => void;
    onRequestDeleteFileLink: () => void;
    onShareFileLink: () => void;
    onToggleHomeCollection: (collectionID: number) => void;
    renameError: string | null;
    renameCollectionOpen: boolean;
    renamingCollection: boolean;
    renameValue: string;
    restoreCollections: LockerCollection[];
    restoreError: string | null;
    restoreCollectionID: number | null;
    restoreDialogOpen: boolean;
    restoringItem: boolean;
    setCreateCollectionName: (value: string) => void;
    setDeleteFileLinkConfirmOpen: (open: boolean) => void;
    setRenameValue: (value: string) => void;
    setRestoreCollectionID: (collectionID: number) => void;
    collectionFilterAnchorEl: HTMLElement | null;
    fileLinkDialogOpen: boolean;
}

export const ItemListDialogs: React.FC<ItemListDialogsProps> = ({
    activeFileLinkItemTitle,
    activeFileLinkURL,
    canNativeShare,
    closeCollectionFilterMenu,
    closeFileLinkDialog,
    clearHomeCollectionSelection,
    createCollectionError,
    createCollectionName,
    createCollectionOpen,
    creatingCollection,
    deleteFileLink,
    dropdownHomeCollections,
    feedbackMessage,
    homeSelectedCollectionIDs,
    isCreatingFileLink,
    isDeleteFileLinkConfirmOpen,
    isDeletingFileLink,
    onCloseFeedback,
    onCloseRenameDialog,
    onCloseRestoreDialog,
    onCloseCreateCollectionDialog,
    onConfirmCreateCollection,
    onConfirmRename,
    onConfirmRestore,
    onCopyFileLink,
    onRequestDeleteFileLink,
    onShareFileLink,
    onToggleHomeCollection,
    renameError,
    renameCollectionOpen,
    renamingCollection,
    renameValue,
    restoreCollections,
    restoreError,
    restoreCollectionID,
    restoreDialogOpen,
    restoringItem,
    setCreateCollectionName,
    setDeleteFileLinkConfirmOpen,
    setRenameValue,
    setRestoreCollectionID,
    collectionFilterAnchorEl,
    fileLinkDialogOpen,
}) => {
    const restoreTitleID = useId();
    return (
        <>
            <LockerFileLinkDialog
                open={fileLinkDialogOpen}
                itemTitle={activeFileLinkItemTitle}
                url={activeFileLinkURL ?? undefined}
                loading={isCreatingFileLink}
                deleting={isDeletingFileLink}
                showShareAction={canNativeShare}
                onClose={closeFileLinkDialog}
                onCopy={onCopyFileLink}
                onShare={onShareFileLink}
                onDelete={onRequestDeleteFileLink}
            />

            <LockerConfirmDialog
                open={isDeleteFileLinkConfirmOpen}
                illustration="/images/file_delete_icon.png"
                title={t("deleteShareLinkDialogTitle")}
                body={t("deleteShareLinkConfirmation")}
                confirmLabel={t("delete")}
                loading={isDeletingFileLink}
                onClose={() => {
                    if (!isDeletingFileLink) {
                        setDeleteFileLinkConfirmOpen(false);
                    }
                }}
                onConfirm={deleteFileLink}
            />

            <Dialog
                slotProps={{
                    paper: { sx: lockerSheetPaperSx },
                    container: { sx: lockerSheetContainerSx },
                }}
                open={restoreDialogOpen}
                aria-labelledby={restoreTitleID}
                onClose={() => {
                    if (!restoringItem) {
                        onCloseRestoreDialog();
                    }
                }}
                fullWidth
                maxWidth="xs"
            >
                <Stack>
                    <Stack
                        direction="row"
                        sx={{ alignItems: "center", gap: 1.5, minHeight: 38 }}
                    >
                        <Typography
                            id={restoreTitleID}
                            noWrap
                            sx={{ ...lockerTextH2Sx, flex: 1, minWidth: 0 }}
                        >
                            {t("restoreToCollection")}
                        </Typography>
                        <IconButton
                            aria-label={t("cancel")}
                            disabled={restoringItem}
                            onClick={() => {
                                if (!restoringItem) {
                                    onCloseRestoreDialog();
                                }
                            }}
                            sx={(theme) => ({
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                p: 0,
                                flexShrink: 0,
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
                    </Stack>
                    <Typography
                        sx={(theme) => ({
                            ...lockerTextMiniSx,
                            mt: 2.5,
                            mb: 1,
                            ...lockerColorSx(theme, { color: "textLight" }),
                        })}
                    >
                        {t("collections")}
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {restoreCollections.length > 0 ? (
                            restoreCollections.map((collection) => (
                                <Chip
                                    key={collection.id}
                                    label={collection.name}
                                    icon={
                                        restoreCollectionID ===
                                        collection.id ? (
                                            <CheckRoundedIcon
                                                sx={{ fontSize: 14 }}
                                            />
                                        ) : undefined
                                    }
                                    disabled={restoringItem}
                                    onClick={() =>
                                        setRestoreCollectionID(collection.id)
                                    }
                                    sx={(theme) => ({
                                        height: 36,
                                        borderRadius: "9999px",
                                        px: "14px",
                                        border: "1px solid",
                                        ...lockerColorSx(theme, {
                                            backgroundColor:
                                                restoreCollectionID ===
                                                collection.id
                                                    ? "primaryLight"
                                                    : "fillLight",
                                            color:
                                                restoreCollectionID ===
                                                collection.id
                                                    ? "primary"
                                                    : "textBase",
                                            ...(restoreCollectionID ===
                                            collection.id
                                                ? {
                                                      borderColor:
                                                          "primaryStroke" as const,
                                                  }
                                                : {}),
                                        }),
                                        ...(restoreCollectionID ===
                                        collection.id
                                            ? {}
                                            : { borderColor: "transparent" }),
                                        "& .MuiChip-label": {
                                            ...lockerTextBodySx,
                                            px: 0,
                                        },
                                        "& .MuiChip-icon": {
                                            ml: 0,
                                            mr: 0.75,
                                            ...lockerColorSx(theme, {
                                                color: "primary",
                                            }),
                                        },
                                    })}
                                />
                            ))
                        ) : (
                            <Typography
                                sx={(theme) => ({
                                    ...lockerTextBodySx,
                                    ...lockerColorSx(theme, {
                                        color: "textLight",
                                    }),
                                })}
                            >
                                {t("noCollectionsAvailableForSelection")}
                            </Typography>
                        )}
                    </Box>
                    {restoreError && (
                        <Typography
                            sx={(theme) => ({
                                ...lockerTextMiniSx,
                                mt: 1.5,
                                ...lockerColorSx(theme, { color: "warning" }),
                            })}
                        >
                            {restoreError}
                        </Typography>
                    )}
                    <LoadingButton
                        fullWidth
                        variant="contained"
                        loading={restoringItem}
                        disabled={restoreCollectionID === null}
                        onClick={onConfirmRestore}
                        sx={(theme) => ({
                            ...lockerTextBodyBoldSx,
                            mt: 3,
                            minHeight: 52,
                            borderRadius: "20px",
                            textTransform: "none",
                            ...lockerColorSx(theme, {
                                backgroundColor: "primary",
                                color: "specialWhite",
                            }),
                            "&:hover": {
                                ...lockerColorSx(theme, {
                                    backgroundColor: "primaryDark",
                                }),
                            },
                            "&.Mui-disabled": {
                                ...lockerColorSx(theme, {
                                    backgroundColor: "fillDarkest",
                                    color: "textLighter",
                                }),
                            },
                        })}
                    >
                        {t("restore")}
                    </LoadingButton>
                </Stack>
            </Dialog>

            <Dialog
                slotProps={{
                    paper: { sx: lockerSheetPaperSx },
                    container: { sx: lockerSheetContainerSx },
                }}
                open={renameCollectionOpen}
                onClose={() => {
                    if (!renamingCollection) {
                        onCloseRenameDialog();
                    }
                }}
                fullWidth
                maxWidth="xs"
            >
                <Stack>
                    <Stack
                        direction="row"
                        sx={{ alignItems: "center", gap: 1.5, minHeight: 38 }}
                    >
                        <Typography
                            sx={{ ...lockerTextH2Sx, flex: 1, minWidth: 0 }}
                        >
                            {t("renameCollection")}
                        </Typography>
                        <IconButton
                            aria-label={t("close")}
                            onClick={onCloseRenameDialog}
                            disabled={renamingCollection}
                            sx={lockerHeaderIconButtonSx}
                        >
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        </IconButton>
                    </Stack>
                    <Box sx={{ mt: 2.5 }}>
                        <FormField
                            value={renameValue}
                            onChange={(event) =>
                                setRenameValue(event.target.value)
                            }
                            label={t("enterCollectionName")}
                            required
                            autoFocus
                            disabled={renamingCollection}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    void onConfirmRename();
                                }
                            }}
                        />
                    </Box>
                    {renameError && (
                        <Typography
                            sx={(theme) => ({
                                ...lockerTextMiniSx,
                                mt: 1.5,
                                ...lockerColorSx(theme, { color: "warning" }),
                            })}
                        >
                            {renameError}
                        </Typography>
                    )}
                    <LoadingButton
                        fullWidth
                        color="primary"
                        loading={renamingCollection}
                        disabled={!renameValue.trim()}
                        onClick={onConfirmRename}
                        sx={(theme) => ({
                            ...lockerTextBodyBoldSx,
                            mt: 3,
                            borderRadius: "20px",
                            textTransform: "none",
                            ...lockerColorSx(theme, {
                                backgroundColor: "primary",
                                color: "specialWhite",
                            }),
                            "&:hover": {
                                ...lockerColorSx(theme, {
                                    backgroundColor: "primaryDark",
                                }),
                            },
                            ...lockerPrimaryButtonSx(theme, {
                                loading: renamingCollection,
                            }),
                        })}
                    >
                        {t("save")}
                    </LoadingButton>
                </Stack>
            </Dialog>

            <Dialog
                slotProps={{
                    paper: { sx: lockerSheetPaperSx },
                    container: { sx: lockerSheetContainerSx },
                }}
                open={createCollectionOpen}
                onClose={() => {
                    if (!creatingCollection) {
                        onCloseCreateCollectionDialog();
                    }
                }}
                fullWidth
                maxWidth="xs"
            >
                <Stack>
                    <Stack
                        direction="row"
                        sx={{ alignItems: "center", gap: 1.5, minHeight: 38 }}
                    >
                        <Typography
                            sx={{ ...lockerTextH2Sx, flex: 1, minWidth: 0 }}
                        >
                            {t("createCollection")}
                        </Typography>
                        <IconButton
                            aria-label={t("close")}
                            onClick={onCloseCreateCollectionDialog}
                            disabled={creatingCollection}
                            sx={lockerHeaderIconButtonSx}
                        >
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        </IconButton>
                    </Stack>
                    <Box sx={{ mt: 2.5 }}>
                        <FormField
                            value={createCollectionName}
                            onChange={(event) =>
                                setCreateCollectionName(event.target.value)
                            }
                            label={t("enterCollectionName")}
                            required
                            autoFocus
                            disabled={creatingCollection}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    onConfirmCreateCollection();
                                }
                            }}
                        />
                    </Box>
                    {createCollectionError && (
                        <Typography
                            sx={(theme) => ({
                                ...lockerTextMiniSx,
                                mt: 1.5,
                                ...lockerColorSx(theme, { color: "warning" }),
                            })}
                        >
                            {createCollectionError}
                        </Typography>
                    )}
                    <LoadingButton
                        fullWidth
                        color="primary"
                        loading={creatingCollection}
                        disabled={!createCollectionName.trim()}
                        onClick={onConfirmCreateCollection}
                        sx={(theme) => ({
                            ...lockerTextBodyBoldSx,
                            mt: 3,
                            borderRadius: "20px",
                            textTransform: "none",
                            ...lockerColorSx(theme, {
                                backgroundColor: "primary",
                                color: "specialWhite",
                            }),
                            "&:hover": {
                                ...lockerColorSx(theme, {
                                    backgroundColor: "primaryDark",
                                }),
                            },
                            ...lockerPrimaryButtonSx(theme, {
                                loading: creatingCollection,
                            }),
                        })}
                    >
                        {t("createCollectionButton")}
                    </LoadingButton>
                </Stack>
            </Dialog>

            <Menu
                anchorEl={collectionFilterAnchorEl}
                open={!!collectionFilterAnchorEl}
                onClose={closeCollectionFilterMenu}
                slotProps={{
                    paper: { sx: [lockerMenuPaperSx, { mt: 1 }] },
                    list: { disablePadding: true },
                }}
            >
                {dropdownHomeCollections.map((collection) => {
                    const isSelected = homeSelectedCollectionIDs.includes(
                        collection.id,
                    );
                    return (
                        <LockerMenuOption
                            key={collection.id}
                            onClick={() =>
                                onToggleHomeCollection(collection.id)
                            }
                            selected={isSelected}
                            secondary={new Intl.NumberFormat().format(
                                collection.items.length,
                            )}
                        >
                            {collection.name}
                        </LockerMenuOption>
                    );
                })}
                {homeSelectedCollectionIDs.length > 0 && (
                    <LockerMenuFooter
                        onClick={() => {
                            clearHomeCollectionSelection();
                            closeCollectionFilterMenu();
                        }}
                    >
                        {t("clearSelection")}
                    </LockerMenuFooter>
                )}
            </Menu>

            <Snackbar
                open={feedbackMessage !== null}
                message={feedbackMessage}
                autoHideDuration={2500}
                onClose={onCloseFeedback}
            />
        </>
    );
};
