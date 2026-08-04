import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import FavoriteIcon from "@mui/icons-material/Favorite";
import PushPinIcon from "@mui/icons-material/PushPin";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Dialog,
    IconButton,
    InputBase,
    Stack,
    styled,
    Tooltip,
    Typography,
    useMediaQuery,
    type SxProps,
    type Theme,
} from "@mui/material";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import type { Collection } from "ente-media/collection";
import { CollectionsSortOptions } from "ente-new/photos/components/CollectionsSortOptions";
import { BaseTileButton, ItemCard } from "ente-new/photos/components/Tiles";
import {
    canAddToCollection,
    canMoveToCollection,
    collectionsSortBy,
    sortCollectionSummaries,
    type CollectionsSortBy,
    type CollectionSummaries,
    type CollectionSummary,
} from "ente-new/photos/services/collection-summary";
import { includes } from "ente-utils/type-guards";
import { t } from "i18next";
import React, { useCallback, useEffect, useMemo, useState } from "react";

export type CollectionSelectorAction =
    | "upload"
    | "add"
    | "move"
    | "restore"
    | "unhide";

export interface CollectionSelectorAttributes {
    /**
     * The {@link action} modifies the title of the dialog, and also removes
     * some system collections that don't might not make sense for that
     * particular action.
     */
    action: CollectionSelectorAction;
    /**
     * Some actions, like "add" and "move", happen in the context of an existing
     * collection summary.
     *
     * In such cases, the ID of the collection summary can be set as the
     * {@link sourceCollectionID} to omit showing it in the list again.
     */
    sourceCollectionSummaryID?: number;
    /**
     * If set, this collection will be shown first in the list.
     *
     * This is useful for the "upload" action, where the user is viewing a
     * specific collection and might want to upload to it.
     */
    activeCollectionID?: number;
    /**
     * If true, only show hidden albums in the collection selector.
     *
     * This is used when uploading from the hidden albums section.
     */
    showHiddenCollections?: boolean;
    /**
     * Callback invoked when the user selects the option to create a new
     * collection.
     */
    onCreateCollection: () => void;
    /**
     * Callback invoked when the user selects one the existing collections
     * listed in the dialog.
     */
    onSelectCollection: (collection: Collection) => void;
    /**
     * Callback invoked when the user cancels the collection selection dialog.
     */
    onCancel?: () => void;
}

export type CollectionSelectorProps = ModalVisibilityProps & {
    /** Callback fired after the selector has finished closing. */
    onExited?: () => void;
    /**
     * The same {@link CollectionSelector} can be used for different
     * purposes by customizing the {@link attributes} prop before opening it.
     */
    attributes: CollectionSelectorAttributes | undefined;
    /**
     * The collections to list.
     *
     * The picker does not list all of the collection summaries, it filters
     * these provided list down to values which make sense for the
     * {@link attribute}'s {@link action}.
     *
     * See: [Note: Picking from selectable collection summaries].
     */
    collectionSummaries: CollectionSummaries;
    /**
     * A function to map from a collection summary ID to a {@link Collection}.
     *
     * This is invoked when the user makes a selection, to convert the ID of the
     * selected collection summary into a collection object that can be passed
     * as the {@link callback} property of {@link CollectionSelectorAttributes}.
     *
     * [Note: Picking from selectable collection summaries]
     *
     * In general, not all pseudo collections can be converted into a
     * collection. For example, there is no underlying collection corresponding
     * to the "All" pseudo collection. However, the implementation of
     * {@link CollectionSelector} is such that it filters the provided
     * {@link collectionSummaries} to only show those which, when selected, can
     * be mapped to an (existing or on-demand created) collection.
     */
    collectionForCollectionSummaryID: (
        collectionID: number,
    ) => Promise<Collection>;
};

/**
 * A dialog allowing the user to select one of their existing collections or
 * create a new one, styled to match the upload design system.
 */
export const CollectionSelector: React.FC<CollectionSelectorProps> = (
    props,
) => {
    const {
        open,
        onClose,
        onExited,
        attributes,
        collectionSummaries,
        collectionForCollectionSummaryID,
    } = props;

    // Make the dialog fullscreen if the screen is <= the dialog's max width.
    const isFullScreen = useMediaQuery("(max-width: 490px)");

    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] =
        useCollectionSelectorSortByLocalState("name-asc");
    const [filteredCollections, setFilteredCollections] = useState<
        CollectionSummary[]
    >([]);

    const handleExited = useCallback(() => {
        setSearchTerm("");
        onExited?.();
    }, [onExited]);

    useEffect(() => {
        if (!attributes || !open) return;

        const activeCollectionID = attributes.activeCollectionID;
        const selectableCollections = [...collectionSummaries.values()].filter(
            (collectionSummary) => {
                if (
                    collectionSummary.id ===
                    attributes.sourceCollectionSummaryID
                ) {
                    return false;
                }

                const isUserFavorites =
                    collectionSummary.type === "userFavorites";
                if (
                    attributes.action === "add" ||
                    attributes.action === "move"
                ) {
                    return (
                        canAddToCollection(collectionSummary) &&
                        !isUserFavorites
                    );
                }
                if (attributes.action === "upload") {
                    return (
                        (canAddToCollection(collectionSummary) ||
                            collectionSummary.type === "uncategorized") &&
                        !isUserFavorites
                    );
                }
                if (attributes.action === "restore") {
                    return (
                        (canMoveToCollection(collectionSummary) ||
                            collectionSummary.type === "uncategorized") &&
                        !isUserFavorites
                    );
                }
                return (
                    canMoveToCollection(collectionSummary) && !isUserFavorites
                );
            },
        );

        const collections = sortCollectionSummaries(
            selectableCollections,
            sortBy,
        )
            .sort((a, b) => b.sortPriority - a.sortPriority)
            .sort((a, b) => {
                if (a.id === activeCollectionID) return -1;
                if (b.id === activeCollectionID) return 1;
                return 0;
            });

        if (collections.length === 0) {
            onClose();
            attributes.onCreateCollection();
            handleExited();
        }

        setFilteredCollections(collections);
    }, [collectionSummaries, attributes, open, onClose, sortBy, handleExited]);

    const searchFilteredCollections = useMemo(() => {
        if (!searchTerm.trim()) return filteredCollections;
        const searchLower = searchTerm.toLowerCase();
        return filteredCollections.filter((collectionSummary) =>
            collectionSummary.name.toLowerCase().includes(searchLower),
        );
    }, [filteredCollections, searchTerm]);

    const showCreateButton =
        !searchTerm.trim() ||
        t("create_albums").toLowerCase().includes(searchTerm.toLowerCase());

    if (!filteredCollections.length || !attributes) return null;

    const { action, onCancel, onCreateCollection, onSelectCollection } =
        attributes;

    const handleCollectionSummaryClick = async (id: number) => {
        onSelectCollection(await collectionForCollectionSummaryID(id));
        onClose();
    };

    const handleClose = () => {
        onCancel?.();
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            fullScreen={isFullScreen}
            maxWidth={false}
            slotProps={{
                paper: { sx: paperSx },
                transition: { onExited: handleExited },
            }}
        >
            <Stack sx={headerSx}>
                <Stack direction="row" sx={headerRowSx}>
                    <Stack sx={{ minWidth: 0, gap: "2px" }}>
                        <Typography sx={titleSx}>
                            {collectionSelectorTitle(action)}
                        </Typography>
                        <Typography sx={countSx}>
                            {searchTerm
                                ? `${searchFilteredCollections.length} / ${filteredCollections.length} ${t("albums")}`
                                : t("albums_count", {
                                      count: filteredCollections.length,
                                  })}
                        </Typography>
                    </Stack>
                    <Stack direction="row" sx={headerActionsSx}>
                        <CollectionsSortOptions
                            activeSortBy={sortBy}
                            onChangeSortBy={setSortBy}
                            nestedInDialog
                            variant="v2"
                        />
                        <IconButton
                            aria-label={t("close")}
                            onClick={handleClose}
                            sx={iconButtonSx}
                        >
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Stack>
                </Stack>
                <SearchField value={searchTerm} onChange={setSearchTerm} />
            </Stack>
            <Box sx={dividerSx} />
            {searchFilteredCollections.length === 0 && !showCreateButton ? (
                <Box sx={noResultsSx}>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("no_results")}
                    </Typography>
                </Box>
            ) : (
                <Box sx={gridSx}>
                    {showCreateButton && (
                        <CreateAlbumTile onClick={onCreateCollection} />
                    )}
                    {searchFilteredCollections.map((collectionSummary) => (
                        <CollectionSummaryButton
                            key={collectionSummary.id}
                            collectionSummary={collectionSummary}
                            onClick={handleCollectionSummaryClick}
                        />
                    ))}
                </Box>
            )}
        </Dialog>
    );
};

const collectionSelectorTitle = (action: CollectionSelectorAction) => {
    switch (action) {
        case "upload":
            return t("upload_to_album");
        case "add":
            return t("add_to_album");
        case "move":
            return t("move_to_album");
        case "restore":
            return t("restore_to_album");
        case "unhide":
            return t("unhide_to_album");
    }
};

const useCollectionSelectorSortByLocalState = (
    initialValue: CollectionsSortBy,
) => {
    const key = "collectionSelectorSortBy";
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        const storedValue = localStorage.getItem(key);
        if (storedValue && includes(collectionsSortBy, storedValue)) {
            setValue(storedValue);
        }
    }, []);

    const setter = (newValue: CollectionsSortBy) => {
        localStorage.setItem(key, newValue);
        setValue(newValue);
    };

    return [value, setter] as const;
};

const surfaceStroke = "#e0e0e0";
const surfaceStrokeDark = "rgba(255 255 255 / 0.12)";

const paperSx: SxProps<Theme> = (theme) => ({
    width: "min(500px, calc(100svw - 32px))",
    maxWidth: "500px",
    boxSizing: "content-box",
    borderRadius: "20px",
    border: `1px solid ${surfaceStroke}`,
    backgroundColor: "#f4f4f4",
    backgroundImage: "none",
    boxShadow: "none",
    color: "text.base",
    "@media (min-width: 491px)": { height: "100%" },
    "@media (max-width: 490px)": {
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 0,
        border: "none",
    },
    ...theme.applyStyles("dark", {
        borderColor: surfaceStrokeDark,
        backgroundColor: "#1b1b1b",
    }),
});

const headerSx = { p: "20px", gap: "16px" };
const headerRowSx = {
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
};
const headerActionsSx = { alignItems: "center", gap: 1, flexShrink: 0 };
const titleSx = {
    fontSize: 24,
    lineHeight: "32px",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};
const countSx = {
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
const gridSx = {
    flex: 1,
    minHeight: 0,
    p: "16px 20px 20px",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gridAutoRows: "max-content",
    gap: "8px",
    alignContent: "start",
    overflowY: "auto",
};
const noResultsSx = {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 154,
};

const TileButton = styled(BaseTileButton)`
    width: 100%;
    aspect-ratio: 1;
    height: auto;
    border-radius: 16px;
`;

const TopGradientOverlay = styled("div")`
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

interface CollectionSummaryButtonProps {
    collectionSummary: CollectionSummary;
    onClick: (collectionSummaryID: number) => void;
}

const CollectionSummaryButton: React.FC<CollectionSummaryButtonProps> = ({
    collectionSummary,
    onClick,
}) => {
    const isFavorite = collectionSummary.type === "userFavorites";
    const isPinned =
        collectionSummary.attributes.has("pinned") ||
        collectionSummary.attributes.has("shareePinned");

    return (
        <ItemCard
            TileComponent={TileButton}
            coverFile={collectionSummary.coverFile}
            onClick={() => onClick(collectionSummary.id)}
        >
            <TopGradientOverlay>
                <Tooltip title={collectionSummary.name} arrow>
                    <Typography
                        sx={{
                            fontSize: 14,
                            lineHeight: "20px",
                            fontWeight: 500,
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
            </TopGradientOverlay>
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
                        <FavoriteIcon sx={{ fontSize: 20, color: "white" }} />
                    )}
                    {isPinned && (
                        <PushPinIcon sx={{ fontSize: 20, color: "white" }} />
                    )}
                </Box>
            )}
        </ItemCard>
    );
};

const CreateAlbumTile: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <TileButton
        aria-label={t("new_album")}
        onClick={onClick}
        sx={{ borderRadius: "16px" }}
    >
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

interface SearchFieldProps {
    value: string;
    onChange: (value: string) => void;
}

const SearchField: React.FC<SearchFieldProps> = ({ value, onChange }) => (
    <Stack direction="row" sx={searchFieldSx}>
        <SearchIcon sx={searchIconSx} />
        <InputBase
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
                        onClick={() => onChange("")}
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
