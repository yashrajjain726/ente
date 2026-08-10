// TODO: Audit this file.
import { CollectionsSortOptions } from "@/components/CollectionsSortOptions";
import { StarIcon } from "@/components/icons/StarIcon";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Button,
    Dialog,
    DialogTitle,
    IconButton,
    InputBase,
    Paper,
    Snackbar,
    Stack,
    styled,
    Tooltip,
    Typography,
    useMediaQuery,
    type SxProps,
    type Theme,
} from "@mui/material";
import { FilledIconButton } from "ente-base/components/mui";
import { SingleInputDialog } from "ente-base/components/SingleInputDialog";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { SlideUpTransition } from "ente-new/photos/components/mui/SlideUpTransition";
import { BaseTileButton, ItemCard } from "ente-new/photos/components/Tiles";
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

type AlbumFilter = "all" | "shared" | "received" | "links" | "empty-albums";

/**
 * The filters, each with the pill label that selects it and the dialog title
 * that replaces "All Albums" while it is selected. The two differ because the
 * pill sits in a row of siblings that names the context ("Shared"), while the
 * title has to carry it alone ("Shared Albums").
 */
const albumFilters: {
    value: AlbumFilter;
    label: () => string;
    title: () => string;
}[] = [
    { value: "all", label: () => t("all"), title: () => t("all_albums") },
    {
        value: "shared",
        label: () => t("shared_albums_label"),
        title: () => t("shared_albums_title"),
    },
    {
        value: "received",
        label: () => t("received_albums_label"),
        title: () => t("received_albums_title"),
    },
    {
        value: "links",
        label: () => t("links_albums_label"),
        title: () => t("links_albums_title"),
    },
    {
        value: "empty-albums",
        label: () => t("empty_albums"),
        title: () => t("empty_albums_title"),
    },
];

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
    const fullScreen = useMediaQuery(`(width < ${FullScreenBreakpoint}px)`);
    const [searchTerm, setSearchTerm] = useState("");
    const [albumFilter, setAlbumFilter] = useState<AlbumFilter>("all");
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
        setAlbumFilter("all");
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
    // Matching mobile, the cleanup is only worth surfacing once there are
    // enough empty albums for it to be a chore.
    const hasEnoughEmptyAlbums = emptyAlbumCandidates.length >= 3;

    const showDeleteEmptyAlbums =
        !isInHiddenSection &&
        hasEnoughEmptyAlbums &&
        albumFilter == "empty-albums" &&
        !searchTerm.trim();

    // A filter with nothing worth showing is not worth a pill.
    const hasQuickLinks = useMemo(
        () => collectionSummaries.some((cs) => cs.attributes.has("quickLink")),
        [collectionSummaries],
    );
    const visibleAlbumFilters = useMemo(
        () =>
            albumFilters.filter(({ value }) => {
                switch (value) {
                    case "links":
                        return hasQuickLinks;
                    case "empty-albums":
                        return hasEnoughEmptyAlbums;
                    default:
                        return true;
                }
            }),
        [hasEnoughEmptyAlbums, hasQuickLinks],
    );

    // The title names whichever filter is showing, so that the pills and the
    // heading never disagree about what is on screen.
    const activeFilterTitle = (
        albumFilters.find(({ value }) => value == albumFilter) ??
        albumFilters[0]!
    ).title();

    // Losing the last quick link (or dropping under the empty-album threshold)
    // takes that pill away; fall back to "all" rather than strand the user on
    // a filter they can no longer see or leave.
    useEffect(() => {
        if (!visibleAlbumFilters.some(({ value }) => value == albumFilter)) {
            setAlbumFilter("all");
        }
    }, [albumFilter, visibleAlbumFilters]);

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
        const albumFilteredCollectionSummaries =
            isInHiddenSection || albumFilter == "all"
                ? collectionSummaries
                : collectionSummaries.filter((cs) => {
                      switch (albumFilter) {
                          case "shared":
                              return (
                                  !cs.attributes.has("sharedIncoming") &&
                                  !cs.attributes.has("quickLink") &&
                                  (cs.attributes.has("sharedOutgoing") ||
                                      cs.attributes.has("sharedViaLink"))
                              );
                          case "received":
                              return cs.attributes.has("sharedIncoming");
                          case "links":
                              return cs.attributes.has("quickLink");
                          case "empty-albums":
                              return isBulkDeletableEmptyAlbum(cs);
                      }
                  });

        if (!searchTerm.trim()) {
            return albumFilteredCollectionSummaries;
        }
        const searchLower = searchTerm.toLowerCase();
        return albumFilteredCollectionSummaries.filter((cs) =>
            cs.name.toLowerCase().includes(searchLower),
        );
    }, [albumFilter, collectionSummaries, isInHiddenSection, searchTerm]);

    const showCreateButton = useMemo(() => {
        if (!canCreateAlbum) return false;
        if (!isInHiddenSection && albumFilter != "all") return false;
        if (!searchTerm.trim()) {
            return true;
        }
        const searchLower = searchTerm.toLowerCase();
        const createText = t("new_album").toLowerCase();
        return createText.includes(searchLower);
    }, [albumFilter, canCreateAlbum, isInHiddenSection, searchTerm]);

    return (
        <>
            <Dialog
                {...{ open, onClose }}
                fullScreen={fullScreen}
                maxWidth={false}
                sx={dialogSx}
                slots={{ transition: SlideUpTransition }}
                slotProps={{
                    paper: { sx: paperSx },
                    transition: { onExited: handleExited },
                }}
            >
                <Stack sx={headerSx}>
                    <Stack direction="row" sx={headerRowSx}>
                        <Stack sx={{ minWidth: 0, gap: "2px" }}>
                            <Typography sx={titleSx}>
                                {isInHiddenSection
                                    ? t("all_hidden_albums")
                                    : activeFilterTitle}
                            </Typography>
                            <Typography sx={bodyMutedSx}>
                                {searchTerm
                                    ? `${filteredCollectionSummaries.length} / ${collectionSummaries.length} ${t("albums")}`
                                    : t("albums_count", {
                                          count: filteredCollectionSummaries.length,
                                      })}
                            </Typography>
                        </Stack>
                        <Stack direction="row" sx={headerActionsSx}>
                            <CollectionsSortOptions
                                activeSortBy={collectionsSortBy}
                                onChangeSortBy={onChangeCollectionsSortBy}
                                nestedInDialog
                                variant="v2"
                            />
                            <IconButton
                                aria-label={t("close")}
                                onClick={onClose}
                                sx={iconButtonSx}
                            >
                                <CloseIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Stack>
                    </Stack>
                    {!isInHiddenSection && (
                        <FilterPills
                            filters={visibleAlbumFilters}
                            value={albumFilter}
                            onChange={setAlbumFilter}
                        />
                    )}
                    <SearchField value={searchTerm} onChange={setSearchTerm} />
                </Stack>
                <Box sx={dividerSx} />
                <AllAlbumsContent
                    collectionSummaries={filteredCollectionSummaries}
                    onCollectionClick={onCollectionClick}
                    hasSearchQuery={!!searchTerm.trim()}
                    showCreateButton={showCreateButton}
                    onCreateAlbum={showAlbumNameInput}
                    reserveFooterSpace={showDeleteEmptyAlbums}
                />
                {showDeleteEmptyAlbums && (
                    <Box sx={sweepFooterSx}>
                        <Button
                            startIcon={<DeleteSweepOutlinedIcon />}
                            onClick={handleDeleteEmptyAlbums}
                            sx={sweepButtonSx}
                        >
                            {t("delete_empty_albums")}
                        </Button>
                    </Box>
                )}
            </Dialog>
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
                                    sx={[bodyMutedSx, { marginTop: "4px" }]}
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

/**
 * Below this the dialog goes full screen, and the surface loses its rounded
 * corners and border. Kept in sync with {@link CollectionSelector}.
 */
const FullScreenBreakpoint = 491;

const surfaceLight = "#f4f4f4";
const surfaceDark = "#1b1b1b";
const surfaceStroke = "#e0e0e0";
const surfaceStrokeDark = "rgba(255 255 255 / 0.12)";

/** Keep the dialog docked to the right edge, as it has always been. */
const dialogSx: SxProps<Theme> = {
    "& .MuiDialog-container": { justifyContent: "flex-end" },
};

const paperSx: SxProps<Theme> = (theme) => ({
    position: "relative",
    width: "min(500px, calc(100svw - 32px))",
    maxWidth: "500px",
    boxSizing: "content-box",
    borderRadius: "20px",
    border: `1px solid ${surfaceStroke}`,
    backgroundColor: surfaceLight,
    backgroundImage: "none",
    boxShadow: "none",
    color: "text.base",
    [`@media (width >= ${FullScreenBreakpoint}px)`]: { height: "100%" },
    [`@media (width < ${FullScreenBreakpoint}px)`]: {
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 0,
        border: "none",
    },
    ...theme.applyStyles("dark", {
        borderColor: surfaceStrokeDark,
        backgroundColor: surfaceDark,
    }),
});

const headerSx = { p: "20px", gap: "16px" };
const headerRowSx = {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
};
const headerActionsSx = { alignItems: "center", gap: 1, flexShrink: 0 };
/**
 * The DS text styles this dialog draws on. The app's MUI typography variants
 * predate the DS and disagree with it (`body` is 16/20, `mini` 12/15), so the
 * styles are spelled out rather than taken from a variant.
 *
 * - display-2 — 600 24/32
 * - body      — 500 14/20
 * - mini      — 500 12/16
 */
const titleSx = {
    // display-2
    fontSize: 24,
    lineHeight: "32px",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};
/** body, muted: the album count, the empty state, the toast's album name. */
const bodyMutedSx = {
    fontSize: 14,
    lineHeight: "20px",
    fontWeight: 500,
    color: "text.muted",
};
const iconButtonSx = (theme: Theme) => ({
    width: 38,
    height: 38,
    p: 0,
    color: "text.base",
    backgroundColor: "background.paper",
    "&:hover": { backgroundColor: "fill.faintHover" },
    ...theme.applyStyles("dark", {
        backgroundColor: "rgba(255 255 255 / 0.12)",
    }),
});
const dividerSx = (theme: Theme) => ({
    height: "1px",
    backgroundColor: "rgba(0 0 0 / 0.06)",
    ...theme.applyStyles("dark", {
        backgroundColor: "rgba(255 255 255 / 0.08)",
    }),
});

const sweepFooterSx = {
    position: "absolute",
    insetInline: 0,
    bottom: "20px",
    px: "20px",
    display: "flex",
    // Let the album grid underneath stay interactive alongside the button.
    pointerEvents: "none",
};
const sweepButtonSx: SxProps<Theme> = (theme) => ({
    pointerEvents: "auto",
    flex: 1,
    height: 52,
    // The dialog's own radius, so the button sits concentrically inside it.
    borderRadius: "20px",
    border: `1px solid ${surfaceStroke}`,
    // White in both themes, deliberately: this is the one control that has to
    // read as raised above the album grid it floats over.
    backgroundColor: "fixed.white",
    color: "fixed.black",
    // DS "body": 500 14px/20px. MUI's own button typography would otherwise
    // impose its wider default letter spacing here.
    fontSize: 14,
    lineHeight: "20px",
    fontWeight: 500,
    letterSpacing: "inherit",
    boxShadow: "0 4px 17.5px rgba(0 0 0 / 0.25)",
    "&:hover": { backgroundColor: "#eaeaea" },
    ...theme.applyStyles("dark", { borderColor: surfaceStrokeDark }),
});

interface FilterPillsProps {
    filters: typeof albumFilters;
    value: AlbumFilter;
    onChange: (value: AlbumFilter) => void;
}

/** The horizontal padding a pill adds around its label, both edges together. */
const PillPaddingInline = 24;

/**
 * A single row of filter chips, mirroring mobile's tag chips.
 *
 * The pills stretch to fill the row, but in proportion to their own labels, so
 * that widening the row scales the pills rather than levelling them out: a
 * filled row keeps the same relative widths the labels have on their own.
 */
const FilterPills: React.FC<FilterPillsProps> = ({
    filters,
    value,
    onChange,
}) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});

    const labels = filters.map((filter) => filter.label());
    const labelKey = labels.join("\n");

    // A stretched pill tells us nothing about how wide it wanted to be, but the
    // label inside it keeps its intrinsic width, so measure that instead and
    // hand each pill a grow factor proportional to it.
    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;

        let cancelled = false;
        const measure = () => {
            const widths: Record<string, number> = {};
            for (const label of row.querySelectorAll<HTMLElement>(
                "[data-filter]",
            )) {
                const width = label.getBoundingClientRect().width;
                if (width) widths[label.dataset.filter!] = width;
            }
            if (!cancelled && Object.keys(widths).length) {
                setLabelWidths(widths);
            }
        };

        measure();
        // Inter arrives as a webfont, and its metrics land after first paint.
        void document.fonts.ready.then(() => !cancelled && measure());
        return () => {
            cancelled = true;
        };
    }, [labelKey]);

    return (
        <Stack
            ref={rowRef}
            direction="row"
            role="group"
            aria-label={t("filter_albums")}
            sx={{ gap: "8px" }}
        >
            {filters.map((filter, i) => {
                const labelWidth = labelWidths[filter.value];
                return (
                    <Pill
                        key={filter.value}
                        aria-pressed={value == filter.value}
                        onClick={() => onChange(filter.value)}
                        // Until measured, sit at the natural width the grow
                        // factors are about to reproduce.
                        style={
                            labelWidth
                                ? {
                                      flexBasis: 0,
                                      flexGrow: labelWidth + PillPaddingInline,
                                  }
                                : undefined
                        }
                        sx={pillSx(value == filter.value)}
                    >
                        <span data-filter={filter.value}>{labels[i]}</span>
                    </Pill>
                );
            })}
        </Stack>
    );
};
/**
 * A bare `button` and not MUI's ButtonBase: buttons do not inherit the page
 * font, and ButtonBase does not restore it either, so spell the DS "body" text
 * style (500 14px/20px Inter) out in full here.
 */
const Pill = styled("button")(({ theme }) => ({
    // The natural size, until FilterPills measures the labels and swaps in a
    // proportional grow factor. `block` (not `flex`) so that a squeezed label
    // ellipsizes instead of being clipped.
    flex: "0 1 auto",
    minWidth: 0,
    display: "block",
    // 10 + 20 line + 10 = 40px. The design's chip is 44px, but that is mobile's
    // touch target rather than a pointer's.
    paddingBlock: "10px",
    // The design pads its chips by 20px, but that is sized for a row that
    // scrolls; five pills have to share one fixed-width row here. Keep this in
    // step with PillPaddingInline.
    paddingInline: "12px",
    border: 0,
    borderRadius: "16px",
    cursor: "pointer",
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 500,
    letterSpacing: "-0.011em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&:focus-visible": {
        outline: `1px solid ${theme.vars.palette.stroke.base}`,
        outlineOffset: 2,
    },
}));

const pillSx = (selected: boolean) => (theme: Theme) => ({
    transition: theme.transitions.create("background-color", { duration: 120 }),
    ...(selected
        ? {
              backgroundColor: "accent.main",
              color: "accent.contrastText",
              "&:hover": { backgroundColor: "accent.dark" },
          }
        : {
              backgroundColor: "background.paper",
              color: "text.muted",
              "&:hover": {
                  backgroundColor: "fill.faintHover",
                  color: "text.base",
              },
              ...theme.applyStyles("dark", {
                  backgroundColor: "rgba(255 255 255 / 0.12)",
              }),
          }),
});
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
        <Stack direction="row" sx={searchFieldSx}>
            <SearchIcon sx={searchIconSx} />
            <InputBase
                inputRef={inputRef}
                fullWidth
                autoFocus
                placeholder={t("albums_search_hint")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                sx={{
                    fontSize: 14,
                    lineHeight: "20px",
                    fontWeight: 500,
                    color: "text.base",
                    "& input::placeholder": { color: "text.muted", opacity: 1 },
                }}
                endAdornment={
                    value ? (
                        <CloseIcon
                            fontSize="small"
                            onClick={handleClear}
                            sx={{
                                color: "stroke.muted",
                                cursor: "pointer",
                                "&:hover": { color: "text.base" },
                            }}
                        />
                    ) : undefined
                }
            />
        </Stack>
    );
};

const searchFieldSx = (theme: Theme) => ({
    alignItems: "center",
    gap: "10px",
    height: 44,
    borderRadius: "16px",
    backgroundColor: "background.paper",
    px: "14px",
    ...theme.applyStyles("dark", { backgroundColor: "#282828" }),
});
const searchIconSx = (theme: Theme) => ({
    fontSize: 20,
    flexShrink: 0,
    color: "rgba(0 0 0 / 0.4)",
    ...theme.applyStyles("dark", { color: "rgba(255 255 255 / 0.4)" }),
});

/** Columns in the album grid, and the gutters around and between them. */
const GridColumns = 3;
const GridGap = 8;
const GridPaddingInline = 20;
const GridPaddingBlockStart = 16;
const GridPaddingBlockEnd = 20;
/** Space kept clear below the grid for the floating "Delete empty albums". */
const GridFooterHeight = 88;

interface ItemData {
    collectionRowList: (CollectionSummary | "create")[][];
    onCollectionClick: (id: number) => void;
    onCreateAlbum: () => void;
    tileSize: number;
}

const createItemData = memoize(
    (
        collectionRowList: (CollectionSummary | "create")[][],
        onCollectionClick: (id: number) => void,
        onCreateAlbum: () => void,
        tileSize: number,
    ) => ({ collectionRowList, onCollectionClick, onCreateAlbum, tileSize }),
);

const AlbumsRow = React.memo(
    ({
        data,
        index,
        style,
        isScrolling,
    }: ListChildComponentProps<ItemData>) => {
        const {
            collectionRowList,
            onCollectionClick,
            onCreateAlbum,
            tileSize,
        } = data;
        const collectionRow = collectionRowList[index]!;
        return (
            <div style={style}>
                <Stack
                    direction="row"
                    sx={{
                        // Consumed by TileButton, so that the tiles can stay
                        // static styled components across resizes.
                        "--tile-size": `${tileSize}px`,
                        px: `${GridPaddingInline}px`,
                        gap: `${GridGap}px`,
                        height: tileSize,
                    }}
                >
                    {collectionRow.map((item) =>
                        item === "create" ? (
                            <CreateAlbumTile
                                key="create"
                                onClick={onCreateAlbum}
                            />
                        ) : (
                            <AlbumCard
                                key={item.id}
                                isScrolling={isScrolling}
                                onCollectionClick={onCollectionClick}
                                collectionSummary={item}
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
    reserveFooterSpace: boolean;
}

const AllAlbumsContent: React.FC<AllAlbumsContentProps> = ({
    collectionSummaries,
    onCollectionClick,
    hasSearchQuery,
    showCreateButton,
    onCreateAlbum,
    reserveFooterSpace,
}) => {
    const refreshInProgress = useRef(false);
    const shouldRefresh = useRef(false);

    const [collectionRowList, setCollectionRowList] = useState<
        (CollectionSummary | "create")[][]
    >([]);

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
                    i < GridColumns && index < collectionSummaries.length;
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
                    i < GridColumns && index < collectionSummaries.length;
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
    }, [collectionSummaries, showCreateButton]);

    if (
        hasSearchQuery &&
        collectionSummaries.length === 0 &&
        !showCreateButton
    ) {
        return (
            <Box sx={noResultsSx}>
                <Typography sx={bodyMutedSx}>{t("no_results")}</Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                flex: 1,
                minHeight: 0,
                pt: `${GridPaddingBlockStart}px`,
                pb: `${reserveFooterSpace ? GridFooterHeight : GridPaddingBlockEnd}px`,
            }}
        >
            <AutoSizer>
                {({ width, height }) => {
                    // Square tiles, sized so that GridColumns of them fill the
                    // width once the gutters are taken out.
                    const tileSize = Math.max(
                        0,
                        Math.floor(
                            (width -
                                2 * GridPaddingInline -
                                (GridColumns - 1) * GridGap) /
                                GridColumns,
                        ),
                    );
                    return (
                        <FixedSizeList
                            {...{ width, height }}
                            itemCount={collectionRowList.length}
                            itemSize={tileSize + GridGap}
                            itemData={createItemData(
                                collectionRowList,
                                onCollectionClick,
                                onCreateAlbum,
                                tileSize,
                            )}
                        >
                            {AlbumsRow}
                        </FixedSizeList>
                    );
                }}
            </AutoSizer>
        </Box>
    );
};

const noResultsSx = {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 154,
};

const TileButton = styled(BaseTileButton)`
    flex: none;
    width: var(--tile-size);
    height: var(--tile-size);
    border-radius: 16px;
`;

const TileTextOverlay = styled("div")`
    position: absolute;
    inset: 0;
    padding: 10px;
    color: #fff;
    background: linear-gradient(
        -10deg,
        rgba(0, 0, 0, 0.1) 0%,
        rgba(0, 0, 0, 0.2) 50%,
        rgba(0, 0, 0, 0.4) 60%,
        rgba(0, 0, 0, 0.6) 100%
    );
`;

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
            TileComponent={TileButton}
            coverFile={collectionSummary.coverFile}
            onClick={() => onCollectionClick(collectionSummary.id)}
            isScrolling={isScrolling}
        >
            <TileTextOverlay>
                <Tooltip title={collectionSummary.name} arrow>
                    <Typography sx={albumNameSx}>
                        {collectionSummary.name}
                    </Typography>
                </Tooltip>
                <Typography sx={albumCountSx}>
                    {t("photos_count", { count: collectionSummary.fileCount })}
                </Typography>
            </TileTextOverlay>
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

const albumNameSx = {
    // body
    fontSize: 14,
    lineHeight: "20px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
};
const albumCountSx = {
    // mini
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 500,
    opacity: 0.7,
};

const CreateAlbumTile: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <TileButton aria-label={t("new_album")} onClick={onClick}>
        <CreateTileInner>
            <AddIcon />
        </CreateTileInner>
    </TileButton>
);

const CreateTileInner = styled("span")(({ theme }) => ({
    position: "absolute",
    inset: 0,
    padding: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px dashed",
    borderColor: theme.vars.palette.stroke.muted,
    borderRadius: 16,
    color: theme.vars.palette.text.muted,
    "&:hover": { borderColor: "rgba(0 0 0 / 0.45)" },
    ...theme.applyStyles("dark", {
        "&:hover": { borderColor: "rgba(255 255 255 / 0.45)" },
    }),
}));
