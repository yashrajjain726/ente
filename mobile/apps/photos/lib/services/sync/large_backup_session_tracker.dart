import "package:logging/logging.dart";
import "package:photos/events/sync_status_update_event.dart";
import "package:photos/extensions/logger_extension.dart";

/// Tracks whether the current upload session is large enough to offer the
/// foreground standby screen.
class LargeBackupSessionTracker {
  static final _logger = Logger("LargeBackupSessionTracker");
  static const int minimumFileCount = 2;

  bool _isEligible = false;
  bool _isUploading = false;
  int _remainingCount = 0;

  bool get shouldOfferStandby =>
      _isUploading && _isEligible && _remainingCount > 0;

  int get remainingCount => _remainingCount;

  void update(SyncStatusUpdate event) {
    switch (event.status) {
      case SyncStatus.preparingForUpload:
        final total = event.total ?? 0;
        _isUploading = total > 0;
        _isEligible = _isEligible || total >= minimumFileCount;
        _remainingCount = total;
        break;
      case SyncStatus.inProgress:
        final total = event.total ?? 0;
        final completed = event.completed ?? 0;
        _isUploading = total > 0;
        _isEligible = _isEligible || total >= minimumFileCount;
        _remainingCount = (total - completed).clamp(0, total);
        break;
      case SyncStatus.paused:
      case SyncStatus.completedBackup:
      case SyncStatus.completedFirstGalleryImport:
      case SyncStatus.error:
        _reset();
        break;
      case SyncStatus.startedFirstGalleryImport:
      case SyncStatus.applyingRemoteDiff:
        break;
    }

    if (_shouldLog(event)) {
      _logger.internalInfo(
        "status=${event.status.name}, total=${event.total}, "
        "completed=${event.completed}, uploading=$_isUploading, "
        "eligible=$_isEligible, remaining=$_remainingCount, "
        "offerStandby=$shouldOfferStandby, "
        "threshold=$minimumFileCount",
      );
    }
  }

  bool _shouldLog(SyncStatusUpdate event) {
    if (event.status != SyncStatus.inProgress) {
      return true;
    }
    final completed = event.completed ?? 0;
    return completed <= 1 || completed % 100 == 0 || _remainingCount == 0;
  }

  void _reset() {
    _isEligible = false;
    _isUploading = false;
    _remainingCount = 0;
  }
}
