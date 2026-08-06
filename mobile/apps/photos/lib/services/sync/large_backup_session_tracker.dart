import "package:flutter/foundation.dart";
import "package:logging/logging.dart";
import "package:photos/events/sync_status_update_event.dart";
import "package:photos/extensions/logger_extension.dart";

/// Tracks whether the current upload session is large enough to offer the
/// foreground standby screen.
class LargeBackupSessionTracker extends ChangeNotifier {
  static final _logger = Logger("LargeBackupSessionTracker");
  static const int minimumFileCount = 2;

  bool _isEligible = false;
  bool _isUploading = false;
  int _remainingCount = 0;
  SyncStatus? _lastStatus;

  // A backup can contain multiple upload batches. The session remains active
  // while the sync service prepares the next batch, even though the current
  // batch's remaining count is temporarily zero.
  bool get isActive => _isUploading && _isEligible;

  int get remainingCount => _remainingCount;

  SyncStatus? get lastStatus => _lastStatus;

  void update(SyncStatusUpdate event) {
    final wasActive = isActive;
    final previousRemainingCount = _remainingCount;
    _lastStatus = event.status;

    switch (event.status) {
      case SyncStatus.preparingForUpload:
        final total = event.total ?? 0;
        _isUploading = total > 0;
        _isEligible = _isEligible || total >= minimumFileCount;
        _remainingCount = total;
        break;
      case SyncStatus.inProgress:
        final total = event.total ?? _remainingCount;
        final completed = event.completed ?? 0;
        _isUploading = total > 0;
        _isEligible = _isEligible || total >= minimumFileCount;
        _remainingCount = (total - completed).clamp(0, total);
        break;
      case SyncStatus.paused:
      case SyncStatus.completedBackup:
      case SyncStatus.error:
        _reset();
        break;
      case SyncStatus.startedFirstGalleryImport:
      case SyncStatus.completedFirstGalleryImport:
      case SyncStatus.applyingRemoteDiff:
        break;
    }

    if (event.status != SyncStatus.inProgress || _remainingCount == 0) {
      _logger.internalInfo(
        "status=${event.status.name}, total=${event.total}, "
        "completed=${event.completed}, uploading=$_isUploading, "
        "eligible=$_isEligible, remaining=$_remainingCount, "
        "active=$isActive, "
        "threshold=$minimumFileCount",
      );
    }

    if (wasActive != isActive || previousRemainingCount != _remainingCount) {
      notifyListeners();
    }
  }

  void _reset() {
    _isEligible = false;
    _isUploading = false;
    _remainingCount = 0;
  }
}
