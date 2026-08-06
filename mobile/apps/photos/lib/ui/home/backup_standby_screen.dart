import "dart:async";

import "package:ente_components/ente_components.dart";
import "package:ente_screen_brightness/ente_screen_brightness.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:logging/logging.dart";
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
  static const _dimmingDelay = Duration(seconds: 3);
  static const _dimmedBrightness = 0.15;

  late int _remainingCount;
  Timer? _dimmingTimer;
  bool _isClosing = false;
  bool _isScreenDimmed = false;
  bool _isWakeLockEnabled = false;

  @override
  void initState() {
    super.initState();
    widget.sessionTracker.setStandbyScreenActive(true);
    _remainingCount = widget.sessionTracker.remainingCount;
    WidgetsBinding.instance.addObserver(this);
    widget.sessionTracker.addListener(_handleBackupSessionChanged);
    final isBackupActive = widget.sessionTracker.isActive;
    if (isBackupActive) {
      _setWakeLock(enable: true);
      _scheduleScreenDimming();
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _dismiss());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isBackupActive = widget.sessionTracker.isActive;
    switch (state) {
      case AppLifecycleState.resumed:
        if (!_isClosing && isBackupActive) {
          _setWakeLock(enable: true);
          _scheduleScreenDimming();
        } else if (!_isClosing) {
          _dismiss();
        }
        break;
      case AppLifecycleState.inactive:
        _restoreScreenBrightness(resetText: true);
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _dismiss();
        break;
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  void dispose() {
    widget.sessionTracker.setStandbyScreenActive(false);
    _restoreScreenBrightness();
    _setWakeLock(enable: false);
    widget.sessionTracker.removeListener(_handleBackupSessionChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const colors = ColorTokens.light;
    final formattedCount = NumberFormat().format(_remainingCount);
    final memoryLabel = _remainingCount == 1 ? "memory" : "memories";
    final statusText = _remainingCount > 0
        ? pendingTranslation("Preserving $formattedCount $memoryLabel")
        : pendingTranslation("Checking for more…");
    final statusColor = colors.specialWhite.withValues(
      alpha: _isScreenDimmed ? 0.35 : 1,
    );
    final instructionColor = colors.textLightest.withValues(
      alpha: _isScreenDimmed ? 0.50 : 1,
    );

    return GestureDetector(
      key: const ValueKey("large-backup-standby-screen"),
      behavior: HitTestBehavior.opaque,
      onTap: _dismiss,
      child: Scaffold(
        backgroundColor: colors.fillBase,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                statusText,
                style: TextStyles.large.copyWith(color: statusColor),
              ),
              const SizedBox(height: 17),
              Text(
                pendingTranslation("Tap to return to Ente"),
                style: TextStyles.body.copyWith(color: instructionColor),
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
      _dismiss();
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

  void _dismiss() {
    if (!mounted || _isClosing) {
      return;
    }
    _isClosing = true;
    _restoreScreenBrightness();
    _setWakeLock(enable: false);
    final route = ModalRoute.of(context)!;
    final navigator = Navigator.of(context);
    if (route.isCurrent) {
      navigator.pop();
    } else {
      navigator.removeRoute(route);
    }
  }

  void _scheduleScreenDimming() {
    _dimmingTimer?.cancel();
    _dimmingTimer = Timer(_dimmingDelay, () async {
      _dimmingTimer = null;
      if (!_canDimScreen) {
        return;
      }

      try {
        final didDim = await EnteScreenBrightness.setBrightness(
          _dimmedBrightness,
        );
        if (didDim && _canDimScreen) {
          setState(() => _isScreenDimmed = true);
        }
      } catch (error, stackTrace) {
        _logger.warning("Could not dim screen brightness", error, stackTrace);
      }
    });
  }

  bool get _canDimScreen =>
      mounted &&
      !_isClosing &&
      widget.sessionTracker.isActive &&
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;

  void _restoreScreenBrightness({bool resetText = false}) {
    _dimmingTimer?.cancel();
    _dimmingTimer = null;
    if (resetText && _isScreenDimmed && mounted) {
      setState(() => _isScreenDimmed = false);
    }
    unawaited(
      EnteScreenBrightness.restore().onError(
        (error, stackTrace) => _logger.warning(
          "Could not restore screen brightness",
          error,
          stackTrace,
        ),
      ),
    );
  }

  void _setWakeLock({required bool enable}) {
    if (_isWakeLockEnabled == enable) {
      return;
    }
    _isWakeLockEnabled = enable;
    wakeLockService.updateWakeLock(
      enable: enable,
      wakeLockFor: WakeLockFor.largeBackupStandbyScreen,
    );
  }
}
