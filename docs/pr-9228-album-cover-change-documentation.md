# PR #9228 Change Documentation

## Scope
- PR: `https://github.com/ente-io/ente/pull/9228`
- Title: `[web][photos] update album cover image`
- Base commit: `56fbdf2de6f778a062dec29c4a83cbf748bccc31`
- Head commit: `460031a842bc5f758a70dc8f125431d1fc7d54a8`
- Changed files: `6`

## High-level summary
This PR adds a complete "set album cover photo" flow in the web photos app.

It introduces:
- A new `Set cover` action in album header overflow menu.
- A new cover-photo picker dialog that lets the user choose one image from the current album.
- A service method to persist `coverID` in collection public metadata.
- Gallery-page wiring to enforce eligibility rules, open the dialog, submit updates, and refresh via `remotePull`.
- New English locale keys for all new UI strings.

## File-by-file changes

### `web/apps/photos/src/components/Collections/CollectionHeader.tsx`
- Added `ImageOutlinedIcon` import.
- Extended `CollectionHeaderProps` with:
  - `canSetAlbumCover: boolean`
  - `onSetAlbumCover: () => void`
- Updated `CollectionHeaderOptions` to accept those props.
- Added a conditional overflow menu option:
  - Key: `set-cover`
  - Label: `t("set_cover")`
  - Icon: `ImageOutlinedIcon`
  - Click handler: `onSetAlbumCover`

What this does:
- Exposes a new album-level action in the existing header menu.
- Keeps the action hidden unless the parent passes `canSetAlbumCover=true`.

### `web/apps/photos/src/components/Collections/GalleryBarAndListHeader.tsx`
- Added `canSetAlbumCover` and `onSetAlbumCover` to `GalleryBarAndListHeaderProps`.
- Passed both props through to `CollectionHeader`.

What this does:
- Provides the prop plumbing layer so page-level logic can control the header menu action.

### `web/apps/photos/src/components/Collections/PickCoverPhotoDialog.tsx` (new)
New component and helpers:

`PickCoverPhotoDialog`:
- Renders a dialog containing `FileList` for the active collection.
- Maintains dialog-local state:
  - `selected` (`SelectedState`) for one chosen file.
  - `submittingAction` (`"use-selected-photo" | "reset-to-default"`) to handle loading/disable behavior.
- Resets selection/submission state whenever dialog opens.
- Builds `annotatedFiles` with `useMemo` and filters out videos (`FileType.video`) so only images are eligible.
- Derives `selectedFile` from `selected`.
- Uses `handleItemClick(index)` to switch to single-file selection.
- Uses `handleUseSelectedPhoto()` to submit selected file to parent callback and close dialog when callback returns `true`.
- Uses `handleResetToDefault()` to submit reset action and close dialog when callback returns `true`.
- Disables close while submitting (`onClose={isSubmitting ? undefined : onClose}`).
- Disables action buttons appropriately during submission/no-selection states.
- Shows helper tooltip: "Only images can be used as cover photos."

`createEmptySelection(collectionID)`:
- Returns baseline `SelectedState` tied to album context with no selected file.

`createSingleSelection(file, collectionID)`:
- Returns `SelectedState` where exactly one file ID is set to `true`.

`fileTimelineDateString(file)`:
- Computes timeline group label used by `FileList`.
- Returns `today`, `yesterday`, or formatted date from file creation time.

What this does:
- Adds the core user interface for picking or resetting album cover image.

### `web/apps/photos/src/pages/gallery.tsx`
Imports:
- Added `PickCoverPhotoDialog`.
- Added `CollectionSubType`.
- Added `updateCollectionCover` service import.

New/changed state + derived values:
- Added modal visibility state: `showPickCoverPhotoDialog` + `pickCoverPhotoDialogVisibilityProps`.
- Added `isOwnedAlbumEligibleForCover` (`useMemo`):
  - Requires `activeCollection`, `activeCollectionSummary`, and `user`.
  - Requires current user to own the collection.
  - Excludes quick-link collections (`CollectionSubType.quicklink`).
  - Allows only views with `album` or `folder` attributes.
- Added `activeCollectionFiles` (`useMemo`):
  - Uses `filteredFiles` normally.
  - In search mode, narrows from `state.collectionFiles` to current collection ID.

New handlers:
- `handleUpdateCollectionCover(coverID)`:
  - Guard: returns `false` if no active collection or not eligible.
  - Shows loading bar.
  - Calls `updateCollectionCover(activeCollection, coverID)`.
  - Calls `remotePull({ silent: true })` to sync UI.
  - Handles errors with `onGenericError`, returns `false` on failure.
  - Always hides loading bar.
- `handleOpenPickCoverPhotoDialog()`:
  - Opens dialog only when collection is eligible.
- `handleUseSelectedCoverPhoto(file)`:
  - Calls `handleUpdateCollectionCover(file.id)`.
- `handleResetCollectionCover()`:
  - Calls `handleUpdateCollectionCover(0)` (`0` means reset to default).

UI wiring:
- Passes `canSetAlbumCover` and `onSetAlbumCover` to `GalleryBarAndListHeader`.
- Renders `PickCoverPhotoDialog` when `activeCollection` exists.
- Provides dialog props:
  - `collection`
  - `files={activeCollectionFiles}`
  - `user`
  - `canResetToDefault={(activeCollection.pubMagicMetadata?.data.coverID ?? 0) > 0}`
  - `onUseSelectedPhoto={handleUseSelectedCoverPhoto}`
  - `onResetToDefault={handleResetCollectionCover}`

What this does:
- Connects menu action -> dialog -> backend metadata update -> refreshed UI.

### `web/packages/base/locales/en-US/translation.json`
Added translation keys:
- `set_cover`
- `select_cover_photo`
- `use_selected_photo`
- `reset_to_default`

What this does:
- Provides copy for the new menu item and dialog actions.

### `web/packages/new/photos/services/collection.ts`
Added function:
- `updateCollectionCover(collection: Collection, coverID: number)`
- Implementation: `updateCollectionPublicMagicMetadata(collection, { coverID })`
- Inline docs clarify:
  - Remote-only update.
  - Intended for owner collections.
  - `coverID = 0` resets cover to default.

What this does:
- Adds service-layer API used by gallery page to persist cover changes.

## Function-level flow (end-to-end)
1. User opens collection overflow menu and clicks `Set cover`.
2. `CollectionHeaderOptions` calls `onSetAlbumCover`.
3. `gallery.tsx` runs `handleOpenPickCoverPhotoDialog()` and opens dialog if eligible.
4. In `PickCoverPhotoDialog`, user selects an image tile.
5. User clicks `Use selected photo` (or `Reset to default`).
6. Dialog calls parent callback in `gallery.tsx`.
7. `handleUpdateCollectionCover(coverID)` calls `updateCollectionCover(...)`.
8. On success, page runs `remotePull({ silent: true })` and dialog closes.
9. On failure, error is surfaced via `onGenericError` and dialog stays open.

## Guardrails and behavior choices
- Feature visibility is gated by ownership and collection type checks.
- Quick-link collections are explicitly excluded.
- Only images can be selected as cover in dialog (`videos` filtered out).
- Submission state prevents concurrent actions and accidental close during request.
- Reset action is enabled only when there is a non-default existing cover.
