import "dart:async";

import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:logging/logging.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/events/sync_status_update_event.dart";
import "package:photos/extensions/logger_extension.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/wake_lock_service.dart";

class BackupStandbyScreen extends StatefulWidget {
  const BackupStandbyScreen({
    required this.initialRemainingCount,
    required this.isBackupActive,
    super.key,
  });

  final int initialRemainingCount;
  final bool Function() isBackupActive;

  @override
  State<BackupStandbyScreen> createState() => _BackupStandbyScreenState();
}

class _BackupStandbyScreenState extends State<BackupStandbyScreen>
    with WidgetsBindingObserver {
  static final _logger = Logger("BackupStandbyScreen");

  late final StreamSubscription<SyncStatusUpdate> _syncSubscription;
  late int _remainingCount;
  bool _isClosing = false;
  bool _isWakeLockEnabled = false;

  @override
  void initState() {
    super.initState();
    _remainingCount = widget.initialRemainingCount;
    WidgetsBinding.instance.addObserver(this);
    _syncSubscription = Bus.instance.on<SyncStatusUpdate>().listen(
      _handleSyncStatus,
    );
    final isBackupActive = widget.isBackupActive();
    _logger.internalInfo(
      "Opened with remaining=$_remainingCount, "
      "backupActive=$isBackupActive, "
      "persistentAutoLock="
      "${wakeLockService.shouldKeepAppAwakeAcrossSessions}",
    );
    if (isBackupActive) {
      _setWakeLock(enable: true);
    } else {
      _logger.internalInfo("Closing because backup finished before opening");
      _isClosing = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _popIfPossible());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isBackupActive = widget.isBackupActive();
    _logger.internalInfo(
      "Lifecycle=${state.name}, backupActive=$isBackupActive, "
      "closing=$_isClosing, wakeLockRequested=$_isWakeLockEnabled",
    );
    switch (state) {
      case AppLifecycleState.resumed:
        if (!_isClosing && isBackupActive) {
          _setWakeLock(enable: true);
        } else if (!_isClosing) {
          _dismiss(reason: "backupInactiveOnResume");
        }
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        _setWakeLock(enable: false);
        break;
    }
  }

  @override
  void dispose() {
    _logger.internalInfo(
      "Disposing with remaining=$_remainingCount, "
      "wakeLockRequested=$_isWakeLockEnabled",
    );
    _setWakeLock(enable: false);
    _syncSubscription.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final formattedCount = NumberFormat().format(_remainingCount);
    final memoryLabel = _remainingCount == 1 ? "memory" : "memories";

    return GestureDetector(
      key: const ValueKey("large-backup-standby-screen"),
      behavior: HitTestBehavior.opaque,
      onTap: () => _dismiss(reason: "userTap"),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                pendingTranslation("Preserving $formattedCount $memoryLabel"),
                style: TextStyles.large.copyWith(color: Colors.white),
              ),
              const SizedBox(height: 17),
              Text(
                pendingTranslation("Tap to wake the screen"),
                style: TextStyles.body.copyWith(color: const Color(0xFFD6D6D6)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleSyncStatus(SyncStatusUpdate event) {
    if (!mounted || _isClosing) {
      return;
    }

    switch (event.status) {
      case SyncStatus.preparingForUpload:
        _updateRemainingCount(event.total ?? _remainingCount);
        _logSyncStatus(event);
        break;
      case SyncStatus.inProgress:
        final total = event.total ?? _remainingCount;
        final completed = event.completed ?? 0;
        _updateRemainingCount((total - completed).clamp(0, total));
        if (_shouldLogProgress(event)) {
          _logSyncStatus(event);
        }
        break;
      case SyncStatus.paused:
      case SyncStatus.completedBackup:
      case SyncStatus.completedFirstGalleryImport:
      case SyncStatus.error:
        _logSyncStatus(event);
        _dismiss(reason: "syncStatus:${event.status.name}");
        break;
      case SyncStatus.startedFirstGalleryImport:
      case SyncStatus.applyingRemoteDiff:
        _logSyncStatus(event);
        break;
    }
  }

  void _logSyncStatus(SyncStatusUpdate event) {
    _logger.internalInfo(
      "Sync status=${event.status.name}, total=${event.total}, "
      "completed=${event.completed}, remaining=$_remainingCount",
    );
  }

  bool _shouldLogProgress(SyncStatusUpdate event) {
    if (event.status != SyncStatus.inProgress) {
      return true;
    }
    final completed = event.completed ?? 0;
    return completed <= 1 || completed % 100 == 0;
  }

  void _updateRemainingCount(int count) {
    if (_remainingCount == count) {
      return;
    }
    setState(() {
      _remainingCount = count;
    });
  }

  void _dismiss({required String reason}) {
    if (_isClosing) {
      _logger.internalInfo("Ignored duplicate dismissal: $reason");
      return;
    }
    _logger.internalInfo(
      "Dismissing: reason=$reason, remaining=$_remainingCount",
    );
    _isClosing = true;
    _setWakeLock(enable: false);
    _popIfPossible();
  }

  void _popIfPossible() {
    if (!mounted) {
      return;
    }
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      _logger.internalWarning("Could not pop standby screen");
    }
  }

  void _setWakeLock({required bool enable}) {
    if (_isWakeLockEnabled == enable) {
      return;
    }
    _isWakeLockEnabled = enable;
    _logger.internalInfo(
      "Wake lock request: enable=$enable, "
      "persistentAutoLock="
      "${wakeLockService.shouldKeepAppAwakeAcrossSessions}",
    );
    wakeLockService.updateWakeLock(
      enable: enable,
      wakeLockFor: WakeLockFor.largeBackupStandbyScreen,
    );
  }
}
