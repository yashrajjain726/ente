import "package:flutter/foundation.dart";
import "package:logging/logging.dart";
import "package:photos/events/sync_status_update_event.dart";

class LargeBackupSessionTracker extends ChangeNotifier {
  static final _logger = Logger("LargeBackupSessionTracker");
  static const int minimumFileCount = 500;

  bool _isEligible = false;
  bool _isUploading = false;
  int _batchTotal = 0;
  int _remainingCount = 0;
  bool _isStandbyScreenActive = false;

  bool get isActive => _isUploading && _isEligible;

  int get remainingCount => _remainingCount;

  bool get isStandbyScreenActive => _isStandbyScreenActive;

  void setStandbyScreenActive(bool value) {
    _isStandbyScreenActive = value;
  }

  void update(SyncStatusUpdate event) {
    final wasActive = isActive;
    final previousRemainingCount = _remainingCount;

    switch (event.status) {
      case SyncStatus.preparingForUpload:
        final total = event.total ?? 0;
        _isUploading = total > 0;
        _isEligible = _isEligible || total >= minimumFileCount;
        _batchTotal = total;
        _remainingCount = total;
        break;
      case SyncStatus.inProgress:
        if (_batchTotal == 0) {
          break;
        }
        final completed = event.completed ?? 0;
        _remainingCount = (_batchTotal - completed).clamp(0, _batchTotal);
        break;
      case SyncStatus.completedBackup:
      case SyncStatus.error:
        _reset();
        break;
      case SyncStatus.paused:
      case SyncStatus.startedFirstGalleryImport:
      case SyncStatus.completedFirstGalleryImport:
      case SyncStatus.applyingRemoteDiff:
        break;
    }

    if (event.status == SyncStatus.preparingForUpload ||
        wasActive != isActive) {
      _logger.info(
        "status=${event.status.name}, batchTotal=$_batchTotal, "
        "eligible=$_isEligible, remaining=$_remainingCount, active=$isActive",
      );
    }

    if (wasActive != isActive || previousRemainingCount != _remainingCount) {
      notifyListeners();
    }
  }

  void _reset() {
    _isEligible = false;
    _isUploading = false;
    _batchTotal = 0;
    _remainingCount = 0;
  }
}
