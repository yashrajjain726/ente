import "package:flutter/foundation.dart";
import "package:photos/events/sync_status_update_event.dart";

class LargeBackupSessionTracker extends ChangeNotifier {
  static const int minimumFileCount = 1000;

  bool _isEligible = false;
  bool _isUploading = false;
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
