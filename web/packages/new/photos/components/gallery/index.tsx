/**
 * @file code that really belongs to pages/gallery.tsx itself (or related
 * files), but it written here in a separate file so that we can write in this
 * package that has TypeScript strict mode enabled.
 *
 * Once the original gallery.tsx is strict mode, this code can be inlined back
 * there.
 */

import CheckIcon from "@mui/icons-material/Check";
import SortIcon from "@mui/icons-material/Sort";
import {
    IconButton,
    Menu,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { CenteredFill, SpacedRow } from "ente-base/components/containers";
import { OverflowMenuOption } from "ente-base/components/OverflowMenu";
import { useModalVisibility } from "ente-base/components/utils/modal";
import type { SearchSuggestion } from "ente-new/photos/services/search/types";
import { t } from "i18next";
import React, { useRef, useState } from "react";
import { enableML } from "../../services/ml";
import { EnableML, FaceConsent } from "../sidebar/MLSettings";
import { useMLStatusSnapshot } from "../utils/use-snapshot";
import { useWrapAsyncOperation } from "../utils/use-wrap-async";
import { GalleryItemsHeaderAdapter, GalleryItemsSummary } from "./ListHeader";

export { GalleryEmptyState } from "./GalleryEmptyState";

/**
 * Options to customize the behaviour of the remote pull that gets triggered on
 * various actions within the gallery and its descendants.
 */
export interface RemotePullOpts {
    /**
     * Perform the pull without showing a global loading bar
     *
     * Default: `false`.
     */
    silent?: boolean;
    /**
     * The action that triggered this pull. Used to annotate downstream logs.
     */
    source?: string;
}
/**
 * The context in which a selection was made.
 *
 * This allows us to reset the selection if user moves to a different context
 * and starts a new selection.
 * */
export type SelectionContext =
    | {
          mode: "albums" | "hidden-albums" | "archive-albums";
          collectionID: number;
      }
    | { mode: "people"; personID: string };

interface SearchResultsHeaderProps {
    searchSuggestion: SearchSuggestion;
    fileCount: number;
    /**
     * Current sort order.
     * - `undefined`: No sort selected (keeps original order, e.g. CLIP relevance)
     * - `true`: Ascending (oldest first)
     * - `false`: Descending (newest first)
     */
    sortAsc: boolean | undefined;
    /**
     * Called when the user changes the sort order.
     * Pass `undefined` to reset to the original order (e.g., CLIP relevance).
     */
    onSortOrderChange: (asc: boolean | undefined) => void;
}

export const SearchResultsHeader: React.FC<SearchResultsHeaderProps> = ({
    searchSuggestion,
    fileCount,
    sortAsc,
    onSortOrderChange,
}) => {
    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const { show: showSortOrderMenu, props: sortOrderMenuVisibilityProps } =
        useModalVisibility();

    const isClipSearch = searchSuggestion.type === "clip";

    const handleRelevanceClick = () => {
        onSortOrderChange(undefined);
    };

    const handleAscClick = () => {
        onSortOrderChange(true);
    };

    const handleDescClick = () => {
        onSortOrderChange(false);
    };

    return (
        <GalleryItemsHeaderAdapter>
            <Typography
                variant="h6"
                sx={{ fontWeight: "regular", color: "text.muted" }}
            >
                {t("search_results")}
            </Typography>
            <SpacedRow>
                <GalleryItemsSummary
                    name={searchSuggestion.label}
                    fileCount={fileCount}
                />
                {fileCount > 0 && (
                    <Tooltip title={t("sort_by")}>
                        <IconButton
                            ref={sortButtonRef}
                            onClick={showSortOrderMenu}
                        >
                            <SortIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </SpacedRow>
            <SearchSortOrderMenu
                {...sortOrderMenuVisibilityProps}
                sortButtonRef={sortButtonRef}
                sortAsc={sortAsc}
                isClipSearch={isClipSearch}
                onRelevanceClick={handleRelevanceClick}
                onAscClick={handleAscClick}
                onDescClick={handleDescClick}
            />
        </GalleryItemsHeaderAdapter>
    );
};

interface SearchSortOrderMenuProps {
    open: boolean;
    onClose: () => void;
    sortButtonRef: React.RefObject<HTMLButtonElement | null>;
    sortAsc: boolean | undefined;
    /** Whether the current search is a CLIP (magic) search. */
    isClipSearch: boolean;
    /** Called when the user selects "Most Relevant" (only shown for CLIP searches). */
    onRelevanceClick: () => void;
    onAscClick: () => void;
    onDescClick: () => void;
}

const SearchSortOrderMenu: React.FC<SearchSortOrderMenuProps> = ({
    open,
    onClose,
    sortButtonRef,
    sortAsc,
    isClipSearch,
    onRelevanceClick,
    onAscClick,
    onDescClick,
}) => {
    const handleRelevanceClick = () => {
        onRelevanceClick();
        onClose();
    };

    const handleAscClick = () => {
        onAscClick();
        onClose();
    };

    const handleDescClick = () => {
        onDescClick();
        onClose();
    };

    return (
        <Menu
            id="search-results-sort"
            anchorEl={sortButtonRef.current}
            open={open}
            onClose={onClose}
            slotProps={{
                list: {
                    disablePadding: true,
                    "aria-labelledby": "search-results-sort",
                },
            }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
            {isClipSearch && (
                <OverflowMenuOption
                    onClick={handleRelevanceClick}
                    endIcon={sortAsc === undefined ? <CheckIcon /> : undefined}
                >
                    {t("most_relevant")}
                </OverflowMenuOption>
            )}
            <OverflowMenuOption
                onClick={handleDescClick}
                endIcon={sortAsc === false ? <CheckIcon /> : undefined}
            >
                {t("newest_first")}
            </OverflowMenuOption>
            <OverflowMenuOption
                onClick={handleAscClick}
                endIcon={sortAsc === true ? <CheckIcon /> : undefined}
            >
                {t("oldest_first")}
            </OverflowMenuOption>
        </Menu>
    );
};

export const PeopleEmptyState: React.FC = () => {
    const mlStatus = useMLStatusSnapshot();

    switch (mlStatus?.phase) {
        case "disabled":
            return <PeopleEmptyStateDisabled />;
        case "done":
            return (
                <PeopleEmptyStateMessage>
                    {t("people_empty_too_few")}
                </PeopleEmptyStateMessage>
            );
        default:
            return (
                <PeopleEmptyStateMessage>
                    {t("syncing_wait")}
                </PeopleEmptyStateMessage>
            );
    }
};

export const PeopleEmptyStateMessage: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <CenteredFill>
        <Typography
            sx={{
                color: "text.muted",
                mx: 1,
                // Approximately compensate for the hidden section bar (86px),
                // and then add a bit extra padding so that the message appears
                // visually off the center, towards the top.
                paddingBlockEnd: "126px",
            }}
        >
            {children}
        </Typography>
    </CenteredFill>
);

export const PeopleEmptyStateDisabled: React.FC = () => {
    const [showConsent, setShowConsent] = useState(false);

    const handleConsent = useWrapAsyncOperation(async () => {
        await enableML();
    });

    return (
        <Stack sx={{ alignItems: "center", flex: 1, overflow: "auto" }}>
            <Paper
                // Top margin is to prevent clipping of the shadow.
                sx={{ maxWidth: "390px", padding: "4px", mt: 1, mb: "2rem" }}
            >
                {!showConsent ? (
                    <EnableML onEnable={() => setShowConsent(true)} />
                ) : (
                    <FaceConsent
                        onConsent={handleConsent}
                        onCancel={() => setShowConsent(false)}
                    />
                )}
            </Paper>
        </Stack>
    );
};
