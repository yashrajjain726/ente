# Free up space deletion recovery plan

## Goal

Prevent a failed batch from turning into one platform deletion request per file, while keeping the existing recovery flow and UI.

## Result model

Batch deletion must return both the IDs deleted so far and one terminal status:

- `completed`
- `cancelled`
- `failed`

Success must not be inferred from `deletedIDs.isNotEmpty`. Already-missing or shared-media IDs must not hide a failure to delete the remaining platform assets.

## Deletion rules

- Remove the individual-ID fallback on Android and iOS.
- Stop on the first batch exception or user cancellation; do not attempt later batches.
- Remove `_recursivelyReduceBatchSizeAndRetryDeletion`.
- Use one shared platform-deletion helper for every attempt, with a maximum batch size of 1,900 where applicable.
- Preserve any intentional legacy Android batching and empty-result behavior.
- Checkpoint only the IDs returned as deleted for each successful batch in `FilesDB` before starting the next batch.
- Close progress dialogs in `finally` without relying on `dialogKey.currentContext!`.

## Recovery flow

1. **Normal deletion**
   - Delete the requested platform assets in batches.
   - If completed, finish successfully.
   - If cancelled, stop without another automatic attempt.
   - If failed, continue to stale-ID recovery.

2. **Stale-ID recovery**
   - Verify that Ente has full gallery permission before treating an unresolved asset as missing.
   - Check which candidates still exist.
   - Immediately checkpoint already-missing IDs.
   - Delete the remaining valid assets through the same batched helper.
   - If no valid assets remain, the operation is complete.
   - If completed, finish successfully.
   - If cancelled, stop.
   - If failed on Android, continue to MediaStore recovery.
   - If failed on iOS, stop.

3. **MediaStore recovery — Android only**
   - Run `removeAllNoExistsAsset()`.
   - Run local sync and recalculate the freeable candidates, restricted to the
     IDs included in the original confirmed operation.
   - Perform one final batched deletion.
   - This is the final automatic attempt regardless of its outcome.

## Completion and consistency

- Checkpoint successful platform batches, already-missing IDs, and successfully removed shared-media files independently.
- If a database checkpoint fails, stop before deleting another batch.
- A successful operation means all remaining valid candidates were handled, or every candidate was authoritatively found to be already missing.
- A partially successful operation that later fails must remain failed, while retaining its completed checkpoints.
- Add an operation lock so two free-space deletions cannot run concurrently.

## Existing UI behavior

No new UI is required for this fix:

- First-attempt success: deletion progress, followed by the existing success UI.
- Stale-ID recovery: deletion progress, `Loading...`, another deletion progress, then success.
- MediaStore recovery: the previous steps, `Please wait, this will take a while.`, a final deletion progress, then success.
- Final failure: remain on the Free Space page and show `Could not free up space`.
- Cancellation must stop the flow instead of opening another deletion prompt.

The existing success UI uses the original estimated size, and the existing failure UI does not describe partial progress.

## Verification

Cover at least:

- A stale ID at the start, middle, and end of a batch.
- A successful batch followed by failure or cancellation; the successful batch remains checkpointed.
- All candidates already missing.
- More than 1,900 valid candidates after filtering.
- Missing IDs found while deletion of remaining valid IDs fails; this must not report success.
- Limited or revoked gallery permission; invisible assets must not be classified as missing.
- Shared-media success combined with platform deletion failure.
- A database checkpoint failure; no later platform batch is attempted.
- Concurrent free-space attempts.
- Context disposal during a platform request.
- Final Android recovery failure; no further deletion calls occur.

Lifecycle-sync suppression and a richer native `photo_manager` result API are optional follow-up hardening, not required for this initial fix.
