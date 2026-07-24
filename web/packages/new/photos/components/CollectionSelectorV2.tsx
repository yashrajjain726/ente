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
import { CollectionsSortOptions } from "ente-new/photos/components/CollectionsSortOptions";
import { BaseTileButton, ItemCard } from "ente-new/photos/components/Tiles";
import type { CollectionSummary } from "ente-new/photos/services/collection-summary";
import { t } from "i18next";
import React from "react";
import type { CollectionSelectorProps } from "./CollectionSelector";
import {
    collectionSelectorTitle,
    useCollectionSelector,
} from "./useCollectionSelector";

/**
 * The internal-only ("v2") variant of {@link CollectionSelector}, restyled to
 * match the upload design system (paper surfaces, hairline borders, radius 20
 * dialog, 16px tiles, paper-filled 38px icon buttons).
 *
 * It preserves the exact same behaviour and props as the classic selector; only
 * the presentation differs. See {@link CollectionSelector} for a description of
 * the props.
 */
export const CollectionSelectorV2: React.FC<CollectionSelectorProps> = (
    props,
) => {
    // Make the dialog fullscreen if the screen is <= the dialog's max width.
    const isFullScreen = useMediaQuery("(max-width: 490px)");
    const {
        attributes,
        searchTerm,
        setSearchTerm,
        sortBy,
        setSortBy,
        filteredCollections,
        searchFilteredCollections,
        showCreateButton,
        handleExited,
        handleCollectionSummaryClick,
        handleClose,
    } = useCollectionSelector({
        ...props,
        createCollectionLabel: t("new_album"),
    });

    if (!filteredCollections.length || !attributes) return null;

    const { action, onCreateCollection } = attributes;

    return (
        <Dialog
            open={props.open}
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
                <SearchFieldV2 value={searchTerm} onChange={setSearchTerm} />
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
                        <CollectionSummaryButtonV2
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

const TileButtonV2 = styled(BaseTileButton)`
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

interface CollectionSummaryButtonV2Props {
    collectionSummary: CollectionSummary;
    onClick: (collectionSummaryID: number) => void;
}

const CollectionSummaryButtonV2: React.FC<CollectionSummaryButtonV2Props> = ({
    collectionSummary,
    onClick,
}) => {
    const isFavorite = collectionSummary.type === "userFavorites";
    const isPinned =
        collectionSummary.attributes.has("pinned") ||
        collectionSummary.attributes.has("shareePinned");

    return (
        <ItemCard
            TileComponent={TileButtonV2}
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
    <TileButtonV2 onClick={onClick} sx={{ borderRadius: "16px" }}>
        <CreateTileInner>
            <Typography
                sx={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}
            >
                {t("new_album")}
            </Typography>
            <Box sx={createTileIconSx}>
                <AddIcon />
            </Box>
        </CreateTileInner>
    </TileButtonV2>
);

const CreateTileInner = styled("span")(({ theme }) => ({
    position: "absolute",
    inset: 0,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    border: "1px dashed",
    borderColor: theme.vars.palette.stroke.muted,
    borderRadius: 16,
    color: theme.vars.palette.text.base,
    "&:hover": { borderColor: "rgba(0 0 0 / 0.45)" },
    ...theme.applyStyles("dark", {
        "&:hover": { borderColor: "rgba(255 255 255 / 0.45)" },
    }),
}));
const createTileIconSx = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "text.muted",
};

interface SearchFieldV2Props {
    value: string;
    onChange: (value: string) => void;
}

const SearchFieldV2: React.FC<SearchFieldV2Props> = ({ value, onChange }) => (
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
