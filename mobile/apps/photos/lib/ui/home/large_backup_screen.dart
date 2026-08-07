import "dart:async";

import "package:ente_components/ente_components.dart";
import "package:ente_screen_brightness/ente_screen_brightness.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:intl/intl.dart";
import "package:logging/logging.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/ente_theme_data.dart";
import "package:photos/events/force_reload_home_gallery_event.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/sync/large_backup_session_tracker.dart";
import "package:photos/services/wake_lock_service.dart";
import "package:photos/ui/settings/components/settings_page_scaffold.dart";
import "package:rive/rive.dart" as rive;

Future<void> showLargeBackupScreen(
  BuildContext context,
  LargeBackupSessionTracker sessionTracker, {
  bool allowWithoutActiveBackup = false,
}) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => LargeBackupScreen(
        sessionTracker: sessionTracker,
        allowWithoutActiveBackup: allowWithoutActiveBackup,
      ),
    ),
  );
}

class LargeBackupScreen extends StatefulWidget {
  const LargeBackupScreen({
    required this.sessionTracker,
    required this.allowWithoutActiveBackup,
    super.key,
  });

  final LargeBackupSessionTracker sessionTracker;
  final bool allowWithoutActiveBackup;

  @override
  State<LargeBackupScreen> createState() => _LargeBackupScreenState();
}

class _LargeBackupScreenState extends State<LargeBackupScreen>
    with WidgetsBindingObserver {
  static final _logger = Logger("LargeBackupScreen");
  static const _applicationBrightness = 0.15;
  static const _dimmingDelay = Duration(seconds: 3);

  late final rive.FileLoader _animationLoader;
  late int _remainingCount;
  Timer? _dimmingTimer;
  bool _didStartStandby = false;
  bool _hasObservedUpload = false;
  bool _isClosing = false;
  bool _isScreenDimmed = false;
  bool _isStandbyActive = false;

  @override
  void initState() {
    super.initState();
    _animationLoader = rive.FileLoader.fromAsset(
      "assets/home_tab.riv",
      riveFactory: rive.Factory.flutter,
    );
    _remainingCount = widget.sessionTracker.remainingCount;
    WidgetsBinding.instance.addObserver(this);
    widget.sessionTracker.addListener(_handleBackupSessionChanged);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_isStandbyActive) {
      return;
    }

    switch (state) {
      case AppLifecycleState.resumed:
        if (_canStartStandby) {
          _scheduleScreenDimming();
        } else {
          _closePage();
        }
        break;
      case AppLifecycleState.inactive:
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _stopStandby();
        break;
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  void dispose() {
    _animationLoader.dispose();
    widget.sessionTracker.removeListener(_handleBackupSessionChanged);
    WidgetsBinding.instance.removeObserver(this);
    if (_isStandbyActive) {
      _deactivateStandby();
    }
    if (_didStartStandby) {
      Bus.instance.fire(ForceReloadHomeGalleryEvent("largeBackupStandbyEnded"));
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: darkThemeData,
      child: Builder(
        builder: (context) => _isStandbyActive
            ? _buildStandbyScreen(context)
            : _buildInstructionsScreen(context),
      ),
    );
  }

  Widget _buildInstructionsScreen(BuildContext context) {
    final colors = context.componentColors;

    return SettingsPageScaffold(
      title: pendingTranslation("Large backup"),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            Spacing.lg,
            Spacing.sm,
            Spacing.lg,
            Spacing.lg,
          ),
          child: ButtonComponent(
            key: const ValueKey("start-large-backup-mode"),
            label: pendingTranslation("Start backup mode"),
            isDisabled: !_canStartStandby,
            shouldSurfaceExecutionStates: false,
            onTap: _startStandby,
          ),
        ),
      ),
      children: [
        const SizedBox(height: Spacing.xl),
        Center(
          child: SizedBox(
            height: 128,
            child: rive.RiveWidgetBuilder(
              fileLoader: _animationLoader,
              builder: (context, state) {
                if (state is rive.RiveLoaded) {
                  return rive.RiveWidget(
                    controller: state.controller,
                    fit: rive.Fit.contain,
                  );
                }
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
        const SizedBox(height: Spacing.xl),
        Text(
          pendingTranslation("Keep Ente awake"),
          textAlign: TextAlign.center,
          style: TextStyles.display1.copyWith(color: colors.textBase),
        ),
        const SizedBox(height: Spacing.md),
        Text(
          pendingTranslation(
            "Keep Ente open while your backup finishes. The screen will stay awake and dim to reduce distraction.",
          ),
          textAlign: TextAlign.center,
          style: TextStyles.body.copyWith(color: colors.textLight),
        ),
        const SizedBox(height: Spacing.xxl),
        Text(
          pendingTranslation("Before you start"),
          style: TextStyles.h2.copyWith(color: colors.textBase),
        ),
        const SizedBox(height: Spacing.lg),
        _InstructionItem(
          icon: HugeIcons.strokeRoundedSmartPhone01,
          title: pendingTranslation("Keep Ente open"),
          description: pendingTranslation(
            "Don't switch apps or lock your iPhone.",
          ),
        ),
        const SizedBox(height: Spacing.xl),
        _InstructionItem(
          icon: HugeIcons.strokeRoundedMoon02,
          title: pendingTranslation("The screen will dim"),
          description: pendingTranslation(
            "This screen dims while your backup continues.",
          ),
        ),
        const SizedBox(height: Spacing.xl),
        _InstructionItem(
          icon: HugeIcons.strokeRoundedPlug01,
          title: pendingTranslation("Connect your charger"),
          description: pendingTranslation(
            "Keeping your iPhone plugged in is recommended.",
          ),
        ),
        const SizedBox(height: Spacing.xxl),
      ],
    );
  }

  Widget _buildStandbyScreen(BuildContext context) {
    final colors = context.componentColors;
    final formattedCount = NumberFormat().format(_remainingCount);
    final memoryLabel = _remainingCount == 1 ? "memory" : "memories";
    final statusText = _remainingCount > 0
        ? pendingTranslation("Preserving $formattedCount $memoryLabel")
        : pendingTranslation("Checking for more…");
    return GestureDetector(
      key: const ValueKey("large-backup-standby-screen"),
      behavior: HitTestBehavior.opaque,
      onTap: _stopStandby,
      child: Scaffold(
        backgroundColor: colors.fillDark,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                statusText,
                style: TextStyles.large.copyWith(color: colors.textBase),
              ),
              const SizedBox(height: 17),
              Text(
                pendingTranslation("Tap to return"),
                style: TextStyles.body.copyWith(color: colors.textLight),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleBackupSessionChanged() {
    if (_isClosing) {
      return;
    }

    if (_isStandbyActive) {
      final isUploading = widget.sessionTracker.isUploading;
      if ((!widget.allowWithoutActiveBackup &&
              !widget.sessionTracker.isActive) ||
          (_hasObservedUpload && !isUploading)) {
        _closePage();
        return;
      }
      _hasObservedUpload = _hasObservedUpload || isUploading;
    }

    setState(() {
      _remainingCount = widget.sessionTracker.remainingCount;
    });
  }

  void _startStandby() {
    if (!_canStartStandby) {
      return;
    }

    setState(() {
      _didStartStandby = true;
      _hasObservedUpload = widget.sessionTracker.isUploading;
      _isScreenDimmed = false;
      _isStandbyActive = true;
      _remainingCount = widget.sessionTracker.remainingCount;
    });
    widget.sessionTracker.setStandbyScreenActive(true);
    wakeLockService.updateWakeLock(
      enable: true,
      wakeLockFor: WakeLockFor.largeBackupStandbyScreen,
    );
    _scheduleScreenDimming();
  }

  void _stopStandby() {
    if (!_isStandbyActive) {
      return;
    }

    _deactivateStandby();
    setState(() {
      _isStandbyActive = false;
    });
  }

  void _closePage() {
    if (_isClosing) {
      return;
    }

    _isClosing = true;
    if (_isStandbyActive) {
      _deactivateStandby();
      _isStandbyActive = false;
    }
    Navigator.of(context).pop();
  }

  void _deactivateStandby() {
    widget.sessionTracker.setStandbyScreenActive(false);
    _dimmingTimer?.cancel();
    _dimmingTimer = null;
    _isScreenDimmed = false;
    unawaited(_resetApplicationBrightness());
    wakeLockService.updateWakeLock(
      enable: false,
      wakeLockFor: WakeLockFor.largeBackupStandbyScreen,
    );
  }

  void _scheduleScreenDimming() {
    if (_isScreenDimmed || _dimmingTimer != null) {
      return;
    }
    _dimmingTimer = Timer(
      _dimmingDelay,
      () => unawaited(_dimApplicationBrightness()),
    );
  }

  Future<void> _dimApplicationBrightness() async {
    _dimmingTimer = null;
    if (!_canDimScreen) {
      return;
    }

    try {
      final didDim = await EnteScreenBrightness.setApplicationBrightness(
        _applicationBrightness,
      );
      if (!_canDimScreen) {
        if (didDim) {
          await _resetApplicationBrightness();
        }
        return;
      }
      _isScreenDimmed = didDim;
    } catch (error, stackTrace) {
      _logger.warning(
        "Could not dim application brightness",
        error,
        stackTrace,
      );
    }
  }

  Future<void> _resetApplicationBrightness() async {
    try {
      await EnteScreenBrightness.resetApplicationBrightness();
    } catch (error, stackTrace) {
      _logger.warning(
        "Could not reset application brightness",
        error,
        stackTrace,
      );
    }
  }

  bool get _canStartStandby =>
      widget.allowWithoutActiveBackup || widget.sessionTracker.isActive;

  bool get _canDimScreen =>
      mounted &&
      !_isClosing &&
      _isStandbyActive &&
      _canStartStandby &&
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
}

class _InstructionItem extends StatelessWidget {
  const _InstructionItem({
    required this.icon,
    required this.title,
    required this.description,
  });

  final List<List<dynamic>> icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.fillDarkest,
            shape: BoxShape.circle,
          ),
          child: SizedBox(
            width: 18,
            height: 18,
            child: HugeIcon(icon: icon, color: colors.textBase, size: 18),
          ),
        ),
        const SizedBox(width: Spacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyles.large.copyWith(color: colors.textBase),
              ),
              const SizedBox(height: Spacing.xs),
              Text(
                description,
                style: TextStyles.body.copyWith(color: colors.textLight),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
