// TODO: Audit this file.
import { CollectionsSortOptions } from "@/components/CollectionsSortOptions";
import { StarIcon } from "@/components/icons/StarIcon";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    InputAdornment,
    Paper,
    Snackbar,
    Stack,
    styled,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
} from "@mui/material";
import { FilledIconButton } from "ente-base/components/mui";
import { SingleInputDialog } from "ente-base/components/SingleInputDialog";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { SlideUpTransition } from "ente-new/photos/components/mui/SlideUpTransition";
import {
    ItemCard,
    LargeTileButton,
    LargeTileCreateNewButton,
    LargeTileTextOverlay,
} from "ente-new/photos/components/Tiles";
import {
    createAlbum,
    createHiddenAlbum,
    deleteCollection,
} from "ente-new/photos/services/collection";
import {
    isBulkDeletableEmptyAlbum,
    type CollectionsSortBy,
    type CollectionSummary,
} from "ente-new/photos/services/collection-summary";
import {
    savedCollectionFiles,
    savedCollections,
} from "ente-new/photos/services/photos-fdb";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { t } from "i18next";
import memoize from "memoize-one";
import React, { useEffect, useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
    areEqual,
    FixedSizeList,
    type ListChildComponentProps,
} from "react-window";

interface AllAlbums {
    open: boolean;
    onClose: () => void;
    collectionSummaries: CollectionSummary[];
    onSelectCollectionID: (id: number) => void;
    collectionsSortBy: CollectionsSortBy;
    onChangeCollectionsSortBy: (by: CollectionsSortBy) => void;
    isInHiddenSection: boolean;
    canCreateAlbum: boolean;
    onRemotePull: () => Promise<void>;
}

export const AllAlbums: React.FC<AllAlbums> = ({
    collectionSummaries,
    open,
    onClose,
    onSelectCollectionID,
    collectionsSortBy,
    onChangeCollectionsSortBy,
    isInHiddenSection,
    canCreateAlbum,
    onRemotePull,
}) => {
    const fullScreen = useMediaQuery("(max-width: 428px)");
    const [searchTerm, setSearchTerm] = useState("");
    const { showMiniDialog } = useBaseContext();
    const { showNotification } = usePhotosAppContext();
    const { show: showAlbumNameInput, props: albumNameInputVisibilityProps } =
        useModalVisibility();
    const [albumCreatedToast, setAlbumCreatedToast] = useState<{
        open: boolean;
        albumId?: number;
        albumName?: string;
    }>({ open: false });

    const handleExited = () => {
        setSearchTerm("");
    };

    const onCollectionClick = (collectionID: number) => {
        onSelectCollectionID(collectionID);
        onClose();
    };

    const handleCreateAlbum = (albumName: string) => {
        onClose();

        void (async () => {
            try {
                const newAlbum = isInHiddenSection
                    ? await createHiddenAlbum(albumName)
                    : await createAlbum(albumName);
                await onRemotePull();

                setAlbumCreatedToast({
                    open: true,
                    albumId: newAlbum.id,
                    albumName: albumName,
                });
            } catch {
                showNotification({
                    color: "critical",
                    title: t("generic_error_retry"),
                });
            }
        })();
    };

    const emptyAlbumCandidates = useMemo(
        () => collectionSummaries.filter(isBulkDeletableEmptyAlbum),
        [collectionSummaries],
    );
    const showDeleteEmptyAlbums =
        !isInHiddenSection &&
        !searchTerm.trim() &&
        emptyAlbumCandidates.length >= 3;

    const deleteEmptyAlbums = async (candidateIDs: number[]) => {
        let failedCount = 0;

        try {
            await onRemotePull();

            const collections = await savedCollections();
            const existingCollectionIDs = new Set(
                collections.map((collection) => collection.id),
            );
            const collectionFiles = await savedCollectionFiles();
            const nonEmptyCollectionIDs = new Set(
                collectionFiles.map((file) => file.collectionID),
            );
            const confirmedCandidateIDs = candidateIDs.filter(
                (id) =>
                    existingCollectionIDs.has(id) &&
                    !nonEmptyCollectionIDs.has(id),
            );

            for (const id of confirmedCandidateIDs) {
                try {
                    await deleteCollection(id, { keepFiles: true });
                } catch {
                    failedCount++;
                }
            }

            await onRemotePull();
        } catch {
            failedCount = candidateIDs.length;
        }

        if (failedCount > 0) {
            showNotification({
                color: "critical",
                title: t("delete_empty_albums_failed", { count: failedCount }),
            });
        }
    };

    const handleDeleteEmptyAlbums = () => {
        const candidateIDs = emptyAlbumCandidates.map((cs) => cs.id);
        showMiniDialog({
            title: t("delete_empty_albums_title"),
            message: t("delete_empty_albums_message", {
                count: candidateIDs.length,
            }),
            continue: {
                text: t("delete"),
                color: "critical",
                action: () => deleteEmptyAlbums(candidateIDs),
            },
        });
    };

    const filteredCollectionSummaries = useMemo(() => {
        if (!searchTerm.trim()) {
            return collectionSummaries;
        }
        const searchLower = searchTerm.toLowerCase();
        return collectionSummaries.filter((cs) =>
            cs.name.toLowerCase().includes(searchLower),
        );
    }, [collectionSummaries, searchTerm]);

    const showCreateButton = useMemo(() => {
        if (!canCreateAlbum) return false;
        if (!searchTerm.trim()) {
            return true;
        }
        const searchLower = searchTerm.toLowerCase();
        const createText = t("new_album").toLowerCase();
        return createText.includes(searchLower);
    }, [canCreateAlbum, searchTerm]);

    return (
        <>
            <AllAlbumsDialog
                {...{ open, onClose, fullScreen }}
                slots={{ transition: SlideUpTransition }}
                slotProps={{ transition: { onExited: handleExited } }}
                fullWidth
            >
                <Title
                    {...{
                        isInHiddenSection,
                        onClose,
                        collectionsSortBy,
                        onChangeCollectionsSortBy,
                    }}
                    collectionCount={filteredCollectionSummaries.length}
                    totalCount={collectionSummaries.length}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onDeleteEmptyAlbums={
                        showDeleteEmptyAlbums
                            ? handleDeleteEmptyAlbums
                            : undefined
                    }
                />
                <Divider />
                <AllAlbumsContent
                    collectionSummaries={filteredCollectionSummaries}
                    onCollectionClick={onCollectionClick}
                    hasSearchQuery={!!searchTerm.trim()}
                    showCreateButton={showCreateButton}
                    onCreateAlbum={showAlbumNameInput}
                />
            </AllAlbumsDialog>
            <SingleInputDialog
                {...albumNameInputVisibilityProps}
                variant="v2"
                title={t("new_album")}
                label={t("album_name")}
                submitButtonTitle={t("create")}
                onSubmit={handleCreateAlbum}
            />
            <Snackbar
                open={albumCreatedToast.open}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            >
                <Paper sx={{ width: "min(360px, 100svw)" }}>
                    <DialogTitle>
                        <Stack
                            direction="row"
                            sx={{
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <Box>
                                <Typography variant="h3">
                                    {t("album_created")}
                                </Typography>
                                <Typography
                                    variant="body"
                                    sx={{
                                        fontWeight: "regular",
                                        color: "text.muted",
                                        marginTop: "4px",
                                    }}
                                >
                                    {albumCreatedToast.albumName &&
                                    albumCreatedToast.albumName.length > 16
                                        ? albumCreatedToast.albumName.substring(
                                              0,
                                              16,
                                          ) + "..."
                                        : albumCreatedToast.albumName}
                                </Typography>
                            </Box>
                            <Stack direction="row" sx={{ gap: 1 }}>
                                <FilledIconButton
                                    onClick={() => {
                                        if (albumCreatedToast.albumId) {
                                            onSelectCollectionID(
                                                albumCreatedToast.albumId,
                                            );
                                        }
                                        setAlbumCreatedToast((prev) => ({
                                            ...prev,
                                            open: false,
                                        }));
                                    }}
                                >
                                    <ArrowForwardIcon />
                                </FilledIconButton>
                                <FilledIconButton
                                    onClick={() =>
                                        setAlbumCreatedToast((prev) => ({
                                            ...prev,
                                            open: false,
                                        }))
                                    }
                                >
                                    <CloseIcon />
                                </FilledIconButton>
                            </Stack>
                        </Stack>
                    </DialogTitle>
                </Paper>
            </Snackbar>
        </>
    );
};

const Column3To2Breakpoint = 559;

const AllAlbumsDialog = styled(Dialog)(({ theme }) => ({
    "& .MuiDialog-container": { justifyContent: "flex-end" },
    "& .MuiPaper-root": { maxWidth: "494px" },
    "& .MuiDialogTitle-root": { padding: theme.spacing(2) },
    "& .MuiDialogContent-root": { padding: theme.spacing(2) },
    [theme.breakpoints.down(Column3To2Breakpoint)]: {
        "& .MuiPaper-root": { width: "324px" },
        "& .MuiDialogContent-root": { padding: 6 },
    },
}));

type TitleProps = {
    collectionCount: number;
    totalCount: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onDeleteEmptyAlbums?: () => void;
} & Pick<
    AllAlbums,
    | "onClose"
    | "collectionsSortBy"
    | "onChangeCollectionsSortBy"
    | "isInHiddenSection"
>;

const Title: React.FC<TitleProps> = ({
    onClose,
    collectionCount,
    totalCount,
    searchTerm,
    onSearchChange,
    collectionsSortBy,
    onChangeCollectionsSortBy,
    isInHiddenSection,
    onDeleteEmptyAlbums,
}) => (
    <DialogTitle>
        <Stack sx={{ gap: 1.5 }}>
            <Stack direction="row" sx={{ gap: 1.5 }}>
                <Stack sx={{ flex: 1 }}>
                    <Box>
                        <Typography variant="h5">
                            {isInHiddenSection
                                ? t("all_hidden_albums")
                                : t("all_albums")}
                        </Typography>
                        <Typography
                            variant="small"
                            sx={{ color: "text.muted", fontWeight: "regular" }}
                        >
                            {searchTerm
                                ? `${collectionCount} / ${totalCount} ${t("albums")}`
                                : t("albums_count", { count: collectionCount })}
                        </Typography>
                    </Box>
                </Stack>
                <CollectionsSortOptions
                    activeSortBy={collectionsSortBy}
                    onChangeSortBy={onChangeCollectionsSortBy}
                    nestedInDialog
                />
                {onDeleteEmptyAlbums ? (
                    <Tooltip title={t("delete_empty_albums")}>
                        <FilledIconButton onClick={onDeleteEmptyAlbums}>
                            <DeleteOutlinedIcon />
                        </FilledIconButton>
                    </Tooltip>
                ) : null}
                <FilledIconButton onClick={onClose}>
                    <CloseIcon />
                </FilledIconButton>
            </Stack>
            <SearchField value={searchTerm} onChange={onSearchChange} />
        </Stack>
    </DialogTitle>
);

interface SearchFieldProps {
    value: string;
    onChange: (value: string) => void;
}

const SearchField: React.FC<SearchFieldProps> = ({ value, onChange }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClear = () => {
        onChange("");
        inputRef.current?.focus();
    };

    return (
        <TextField
            inputRef={inputRef}
            fullWidth
            size="small"
            placeholder={t("albums_search_hint")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            slotProps={{
                input: {
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon />
                        </InputAdornment>
                    ),
                    endAdornment: value && (
                        <InputAdornment
                            position="end"
                            sx={{ marginRight: "0 !important" }}
                        >
                            <CloseIcon
                                fontSize="small"
                                onClick={handleClear}
                                sx={{
                                    color: "stroke.muted",
                                    cursor: "pointer",
                                    "&:hover": { color: "text.base" },
                                }}
                            />
                        </InputAdornment>
                    ),
                },
            }}
            sx={{
                "& .MuiOutlinedInput-root": {
                    backgroundColor: "background.searchInput",
                    borderColor: "transparent",
                    "&:hover": { borderColor: "accent.light" },
                    "&.Mui-focused": {
                        borderColor: "accent.main",
                        boxShadow: "none",
                    },
                },
                "& .MuiInputBase-input": {
                    color: "text.base",
                    paddingTop: "8.5px !important",
                    paddingBottom: "8.5px !important",
                },
                "& .MuiInputAdornment-root": {
                    color: "stroke.muted",
                    marginTop: "0 !important",
                    marginRight: "8px",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "transparent",
                },
                "& .MuiInputBase-input::placeholder": {
                    color: "text.muted",
                    opacity: 1,
                },
            }}
        />
    );
};

const CollectionRowItemSize = 154;

interface ItemData {
    collectionRowList: (CollectionSummary | "create")[][];
    onCollectionClick: (id: number) => void;
    onCreateAlbum: () => void;
}

const createItemData = memoize(
    (
        collectionRowList: (CollectionSummary | "create")[][],
        onCollectionClick: (id: number) => void,
        onCreateAlbum: () => void,
    ) => ({ collectionRowList, onCollectionClick, onCreateAlbum }),
);

const AlbumsRow = React.memo(
    ({
        data,
        index,
        style,
        isScrolling,
    }: ListChildComponentProps<ItemData>) => {
        const { collectionRowList, onCollectionClick, onCreateAlbum } = data;
        const collectionRow = collectionRowList[index]!;
        return (
            <div style={style}>
                <Stack direction="row" sx={{ p: 2, gap: 0.5 }}>
                    {collectionRow.map((item) =>
                        item === "create" ? (
                            <LargeTileCreateNewButton
                                key="create"
                                onClick={onCreateAlbum}
                            >
                                {t("new_album")}
                            </LargeTileCreateNewButton>
                        ) : (
                            <AlbumCard
                                isScrolling={isScrolling}
                                onCollectionClick={onCollectionClick}
                                collectionSummary={item}
                                key={item.id}
                            />
                        ),
                    )}
                </Stack>
            </div>
        );
    },
    areEqual,
);

interface AllAlbumsContentProps {
    collectionSummaries: CollectionSummary[];
    onCollectionClick: (id: number) => void;
    hasSearchQuery: boolean;
    showCreateButton: boolean;
    onCreateAlbum: () => void;
}

const AllAlbumsContent: React.FC<AllAlbumsContentProps> = ({
    collectionSummaries,
    onCollectionClick,
    hasSearchQuery,
    showCreateButton,
    onCreateAlbum,
}) => {
    const isTwoColumn = useMediaQuery(`(width < ${Column3To2Breakpoint}px)`);

    const refreshInProgress = useRef(false);
    const shouldRefresh = useRef(false);

    const [collectionRowList, setCollectionRowList] = useState<
        (CollectionSummary | "create")[][]
    >([]);

    const columns = isTwoColumn ? 2 : 3;

    useEffect(() => {
        const main = () => {
            if (refreshInProgress.current) {
                shouldRefresh.current = true;
                return;
            }
            refreshInProgress.current = true;

            const collectionRowList: (CollectionSummary | "create")[][] = [];
            let index = 0;

            if (showCreateButton) {
                const firstRow: (CollectionSummary | "create")[] = ["create"];
                for (
                    let i = 1;
                    i < columns && index < collectionSummaries.length;
                    i++
                ) {
                    firstRow.push(collectionSummaries[index++]!);
                }
                collectionRowList.push(firstRow);
            }

            while (index < collectionSummaries.length) {
                const collectionRow: (CollectionSummary | "create")[] = [];
                for (
                    let i = 0;
                    i < columns && index < collectionSummaries.length;
                    i++
                ) {
                    collectionRow.push(collectionSummaries[index++]!);
                }
                collectionRowList.push(collectionRow);
            }
            setCollectionRowList(collectionRowList);
            refreshInProgress.current = false;
            if (shouldRefresh.current) {
                shouldRefresh.current = false;
                setTimeout(main, 0);
            }
        };
        main();
    }, [collectionSummaries, columns, showCreateButton]);

    const itemData = createItemData(
        collectionRowList,
        onCollectionClick,
        onCreateAlbum,
    );

    if (
        hasSearchQuery &&
        collectionSummaries.length === 0 &&
        !showCreateButton
    ) {
        return (
            <DialogContent sx={{ height: "80svh" }}>
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100%",
                    }}
                >
                    <Typography sx={{ color: "text.muted" }}>
                        {t("no_results")}
                    </Typography>
                </Box>
            </DialogContent>
        );
    }

    return (
        <DialogContent sx={{ "&&": { padding: 0 }, height: "80svh" }}>
            <AutoSizer>
                {({ width, height }) => (
                    <FixedSizeList
                        {...{ width, height }}
                        itemCount={collectionRowList.length}
                        itemSize={CollectionRowItemSize}
                        itemData={itemData}
                    >
                        {AlbumsRow}
                    </FixedSizeList>
                )}
            </AutoSizer>
        </DialogContent>
    );
};

interface AlbumCardProps {
    collectionSummary: CollectionSummary;
    onCollectionClick: (collectionID: number) => void;
    isScrolling?: boolean;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
    onCollectionClick,
    collectionSummary,
    isScrolling,
}) => {
    const isFavorite = collectionSummary.type === "userFavorites";
    const isPinned = collectionSummary.attributes.has("pinned");

    return (
        <ItemCard
            TileComponent={LargeTileButton}
            coverFile={collectionSummary.coverFile}
            onClick={() => onCollectionClick(collectionSummary.id)}
            isScrolling={isScrolling}
        >
            <LargeTileTextOverlay>
                <Tooltip title={collectionSummary.name} arrow>
                    <Typography
                        sx={{
                            maxWidth: "130px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                        }}
                    >
                        {collectionSummary.name}
                    </Typography>
                </Tooltip>
                <Typography variant="small" sx={{ opacity: 0.7 }}>
                    {t("photos_count", { count: collectionSummary.fileCount })}
                </Typography>
            </LargeTileTextOverlay>
            {(isFavorite || isPinned) && (
                <Box
                    sx={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        display: "flex",
                        gap: 0.5,
                    }}
                >
                    {isFavorite && (
                        <StarIcon sx={{ fontSize: 20, color: "white" }} />
                    )}
                    {isPinned && (
                        <PushPinIcon sx={{ fontSize: 20, color: "white" }} />
                    )}
                </Box>
            )}
        </ItemCard>
    );
};
