import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:logging/logging.dart";
import "package:photos/extensions/logger_extension.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/sync/large_backup_session_tracker.dart";
import "package:photos/services/wake_lock_service.dart";

class BackupStandbyScreen extends StatefulWidget {
  const BackupStandbyScreen({required this.sessionTracker, super.key});

  final LargeBackupSessionTracker sessionTracker;

  @override
  State<BackupStandbyScreen> createState() => _BackupStandbyScreenState();
}

class _BackupStandbyScreenState extends State<BackupStandbyScreen>
    with WidgetsBindingObserver {
  static final _logger = Logger("BackupStandbyScreen");

  late int _remainingCount;
  bool _isClosing = false;
  bool _isWakeLockEnabled = false;

  @override
  void initState() {
    super.initState();
    _remainingCount = widget.sessionTracker.remainingCount;
    WidgetsBinding.instance.addObserver(this);
    widget.sessionTracker.addListener(_handleBackupSessionChanged);
    final isBackupActive = widget.sessionTracker.isActive;
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
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _dismiss(reason: "backupInactiveBeforeOpening"),
      );
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isBackupActive = widget.sessionTracker.isActive;
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
    widget.sessionTracker.removeListener(_handleBackupSessionChanged);
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

  void _handleBackupSessionChanged() {
    if (!mounted || _isClosing) {
      return;
    }

    if (!widget.sessionTracker.isActive) {
      _dismiss(reason: "syncStatus:${widget.sessionTracker.lastStatus?.name}");
      return;
    }

    final remainingCount = widget.sessionTracker.remainingCount;
    if (_remainingCount == remainingCount) {
      return;
    }
    setState(() {
      _remainingCount = remainingCount;
    });
  }

  void _dismiss({required String reason}) {
    if (_isClosing) {
      _logger.internalInfo("Ignored duplicate dismissal: $reason");
      return;
    }
    if (!mounted) {
      return;
    }
    final navigator = Navigator.of(context);
    if (!navigator.canPop()) {
      _logger.internalWarning("Could not pop standby screen");
      return;
    }
    _logger.internalInfo(
      "Dismissing: reason=$reason, remaining=$_remainingCount",
    );
    _setWakeLock(enable: false);
    navigator.pop();
    _isClosing = true;
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
