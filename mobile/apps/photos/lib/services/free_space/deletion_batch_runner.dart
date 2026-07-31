import "dart:math";

import "package:logging/logging.dart";

final _logger = Logger("DeletionBatchRunner");

enum LocalDeletionStatus { completed, cancelled, failed }

class LocalDeletionResult {
  final LocalDeletionStatus status;
  final Set<String> deletedIDs;
  final Set<String> alreadyMissingIDs;
  final bool canAttemptRecovery;

  const LocalDeletionResult({
    required this.status,
    this.deletedIDs = const <String>{},
    this.alreadyMissingIDs = const <String>{},
    this.canAttemptRecovery = false,
  });

  bool get isCompleted => status == LocalDeletionStatus.completed;
  bool get isCancelled => status == LocalDeletionStatus.cancelled;
}

Set<String> retainOriginalDeletionCandidates({
  required Iterable<String> refreshedLocalIDs,
  required Iterable<String> originalLocalIDs,
}) {
  return refreshedLocalIDs.toSet().intersection(originalLocalIDs.toSet());
}

Future<LocalDeletionResult> executeDeletionBatches({
  required List<String> localIDs,
  required int batchSize,
  required Future<List<String>> Function(List<String>) deleteBatch,
  required Future<void> Function(Set<String>) checkpoint,
  bool emptyResultMeansCompleted = false,
  void Function(int completed, int total)? onProgress,
}) async {
  if (batchSize <= 0) {
    throw ArgumentError.value(batchSize, "batchSize", "Must be positive");
  }
  final uniqueLocalIDs = localIDs.toSet().toList();
  final deletedIDs = <String>{};
  if (uniqueLocalIDs.isEmpty) {
    return const LocalDeletionResult(status: LocalDeletionStatus.completed);
  }

  _logger.info("Batch size: $batchSize");
  for (var index = 0; index < uniqueLocalIDs.length; index += batchSize) {
    onProgress?.call(index, uniqueLocalIDs.length);
    final batch = uniqueLocalIDs
        .getRange(index, min(uniqueLocalIDs.length, index + batchSize))
        .toList();
    final attemptedIDs = batch.toSet();
    _logger.info("Trying to delete ${batch.length} files");

    late final List<String> returnedIDs;
    try {
      returnedIDs = await deleteBatch(batch);
    } catch (e, s) {
      _logger.severe("Could not delete batch of ${batch.length} files", e, s);
      return LocalDeletionResult(
        status: LocalDeletionStatus.failed,
        deletedIDs: deletedIDs,
        canAttemptRecovery: true,
      );
    }

    final removedIDs = returnedIDs.toSet().intersection(attemptedIDs);
    if (removedIDs.isNotEmpty) {
      try {
        await checkpoint(removedIDs);
      } catch (e, s) {
        _logger.severe("Could not checkpoint deleted batch", e, s);
        return LocalDeletionResult(
          status: LocalDeletionStatus.failed,
          deletedIDs: deletedIDs..addAll(removedIDs),
        );
      }
      deletedIDs.addAll(removedIDs);
    }
    _logger.info("Deleted ${removedIDs.length} of ${batch.length} files");

    if (removedIDs.length != attemptedIDs.length) {
      if (removedIDs.isEmpty && emptyResultMeansCompleted) {
        continue;
      }
      _logger.info(
        "Platform deletion returned fewer IDs than requested; stopping",
      );
      return LocalDeletionResult(
        status: LocalDeletionStatus.cancelled,
        deletedIDs: deletedIDs,
      );
    }
  }
  onProgress?.call(uniqueLocalIDs.length, uniqueLocalIDs.length);
  return LocalDeletionResult(
    status: LocalDeletionStatus.completed,
    deletedIDs: deletedIDs,
  );
}

LocalDeletionResult combineDeletionResults(
  LocalDeletionResult sharedMediaResult,
  LocalDeletionResult platformResult, {
  Set<String> alreadyMissingIDs = const <String>{},
}) {
  final deletedIDs = <String>{
    ...sharedMediaResult.deletedIDs,
    ...platformResult.deletedIDs,
  };
  final missingIDs = <String>{
    ...alreadyMissingIDs,
    ...sharedMediaResult.alreadyMissingIDs,
    ...platformResult.alreadyMissingIDs,
  };
  if (platformResult.isCancelled) {
    return LocalDeletionResult(
      status: LocalDeletionStatus.cancelled,
      deletedIDs: deletedIDs,
      alreadyMissingIDs: missingIDs,
    );
  }
  if (sharedMediaResult.status == LocalDeletionStatus.failed ||
      platformResult.status == LocalDeletionStatus.failed) {
    final sharedFailureCanRecover =
        sharedMediaResult.status != LocalDeletionStatus.failed ||
        sharedMediaResult.canAttemptRecovery;
    final platformFailureCanRecover =
        platformResult.status != LocalDeletionStatus.failed ||
        platformResult.canAttemptRecovery;
    return LocalDeletionResult(
      status: LocalDeletionStatus.failed,
      deletedIDs: deletedIDs,
      alreadyMissingIDs: missingIDs,
      canAttemptRecovery: sharedFailureCanRecover && platformFailureCanRecover,
    );
  }
  return LocalDeletionResult(
    status: LocalDeletionStatus.completed,
    deletedIDs: deletedIDs,
    alreadyMissingIDs: missingIDs,
  );
}
