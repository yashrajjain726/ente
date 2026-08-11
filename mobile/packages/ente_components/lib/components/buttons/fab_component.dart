import "dart:async";

import "package:ente_components/models/component_execution_state.dart";
import "package:ente_components/theme/icon_sizes.dart";
import "package:ente_components/theme/motion.dart";
import "package:ente_components/theme/text_styles.dart";
import "package:ente_components/theme/theme.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";

enum FABComponentVariant { primary, secondary }

/// Figma: https://www.figma.com/design/BuBNPPytxlVnqfmCUW0mgz/Ente-Visual-Design?node-id=21843-6537&m=dev
/// Section: Buttons / Floating action button
/// Specs: Extended is 56px high with 20px leading padding, 24px trailing
/// padding, an 8px gap, and a 999px radius. Icon is 52px square with a 30px
/// radius.
/// Types: Extended, Icon.
/// States: Extended has default and pressed. Icon has default.
class FABComponent extends StatefulWidget {
  final String? label;

  final FutureOr<void> Function()? onTap;

  final FABComponentVariant variant;

  final bool isDisabled;

  final Widget? icon;

  const FABComponent({
    super.key,
    this.icon,
    this.label,
    this.onTap,
    this.variant = FABComponentVariant.primary,
    this.isDisabled = false,
    this.shouldSurfaceExecutionStates = true,
    this.shouldShowSuccessState = true,
    this.shouldShowSuccessConfirmation = false,
  });

  final bool shouldSurfaceExecutionStates;

  final bool shouldShowSuccessState;

  final bool shouldShowSuccessConfirmation;

  @override
  State<FABComponent> createState() => _FABComponentState();
}

class _FABComponentState extends State<FABComponent>
    with SingleTickerProviderStateMixin {
  static const Duration _loadingDelay = Duration(milliseconds: 300);
  static const Duration _successDisplayDuration = Duration(seconds: 1);

  late final AnimationController _loadingController;
  bool _isPressed = false;
  Timer? _loadingTimer;
  Timer? _successResetTimer;
  bool _loadingVisible = false;
  ComponentExecutionState _executionState = ComponentExecutionState.idle;

  @override
  void initState() {
    super.initState();
    _loadingController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
  }

  @override
  void didUpdateWidget(covariant FABComponent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isDisabled && !oldWidget.isDisabled) {
      _isPressed = false;
    }
    _syncLoadingController();
  }

  @override
  void dispose() {
    _loadingTimer?.cancel();
    _successResetTimer?.cancel();
    _loadingController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEnabled =
        !widget.isDisabled &&
        widget.onTap != null &&
        !_isExecuting &&
        !_isSuccessful;
    final colors = context.componentColors;
    final backgroundColor = switch (widget.variant) {
      FABComponentVariant.primary =>
        _isPressed ? colors.primaryDark : colors.primary,
      FABComponentVariant.secondary =>
        _isPressed ? colors.fillDarker : colors.fillDark,
    };
    final foregroundColor = switch (widget.variant) {
      FABComponentVariant.primary => colors.specialWhite,
      FABComponentVariant.secondary => colors.primary,
    };
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: isEnabled ? _handleTap : null,
      onTapDown: isEnabled ? (_) => _setPressed(true) : null,
      onTapUp: isEnabled ? (_) => _setPressed(false) : null,
      onTapCancel: isEnabled ? () => _setPressed(false) : null,
      child: AnimatedScale(
        scale: _isPressed ? 0.98 : 1,
        duration: Motion.quick,
        curve: Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: Motion.standard,
          curve: Curves.easeInOutCubic,
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(9999),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: widget.label == null ? 0 : 24,
              ),
              child: AnimatedSwitcher(
                duration: Motion.quick,
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: _content(foregroundColor),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _setPressed(bool value) {
    if (_isPressed == value) return;
    setState(() => _isPressed = value);
  }

  Widget _content(Color foreground) {
    if (_showLoading) {
      return _executionContent(
        key: const ValueKey("loading"),
        child: RotationTransition(
          turns: _loadingController,
          child: HugeIcon(
            icon: HugeIcons.strokeRoundedLoading03,
            size: IconSizes.small,
            color: foreground,
          ),
        ),
      );
    }
    if (_showSuccess) {
      return _executionContent(
        key: const ValueKey("success"),
        child: HugeIcon(
          icon: HugeIcons.strokeRoundedTick02,
          size: IconSizes.small,
          color: foreground,
        ),
      );
    }
    return _idleContent(foreground);
  }

  Widget _idleContent(Color foreground) {
    return Row(
      key: const ValueKey("content"),
      spacing: 8,
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.icon != null)
          IconTheme.merge(
            data: IconThemeData(color: foreground, size: IconSizes.small),
            child: widget.icon!,
          ),
        if (widget.label != null)
          Text(
            widget.label!,
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
            style: TextStyles.bodyBold.copyWith(color: foreground),
          ),
      ],
    );
  }

  Widget _executionContent({required Key key, required Widget child}) {
    return Stack(
      key: key,
      alignment: Alignment.center,
      children: [
        Visibility(
          visible: false,
          maintainAnimation: true,
          maintainSize: true,
          maintainState: true,
          child: _idleContent(Colors.transparent),
        ),
        child,
      ],
    );
  }

  bool get _isExecuting =>
      _executionState == ComponentExecutionState.inProgress;

  bool get _isSuccessful =>
      _executionState == ComponentExecutionState.successful;

  bool get _showLoading =>
      widget.shouldSurfaceExecutionStates && _isExecuting && _loadingVisible;

  bool get _showSuccess =>
      widget.shouldSurfaceExecutionStates &&
      widget.shouldShowSuccessState &&
      _isSuccessful;

  void _syncLoadingController() {
    if (_showLoading) {
      if (!_loadingController.isAnimating) {
        _loadingController.repeat();
      }
      return;
    }

    if (_loadingController.isAnimating || _loadingController.value != 0) {
      _loadingController.stop();
      _loadingController.reset();
    }
  }

  Future<void> _handleTap() async {
    final callback = widget.onTap;
    if (callback == null) return;

    _successResetTimer?.cancel();
    var loadingSurfaced = false;
    _loadingTimer?.cancel();
    setState(() {
      _executionState = ComponentExecutionState.inProgress;
      _loadingVisible = false;
      _isPressed = false;
    });
    _loadingTimer = Timer(_loadingDelay, () {
      if (!mounted) return;
      loadingSurfaced = true;
      setState(() {
        _loadingVisible = true;
        _isPressed = false;
      });
      _syncLoadingController();
    });

    try {
      await Future.sync(callback);
      if (!mounted) return;

      final loadingPending = _loadingTimer?.isActive ?? false;
      _loadingTimer?.cancel();
      _loadingTimer = null;

      final shouldShowSuccess =
          widget.shouldSurfaceExecutionStates &&
          widget.shouldShowSuccessState &&
          (loadingSurfaced ||
              (loadingPending && widget.shouldShowSuccessConfirmation));

      if (shouldShowSuccess) {
        _showSuccessForDuration();
      } else {
        _clearExecutionState();
      }
    } catch (_) {
      _loadingTimer?.cancel();
      _loadingTimer = null;
      if (mounted) {
        _clearExecutionState();
      }
    }
  }

  void _clearExecutionState() {
    setState(() {
      _executionState = ComponentExecutionState.idle;
      _loadingVisible = false;
      _isPressed = false;
    });
    _syncLoadingController();
  }

  void _showSuccessForDuration() {
    setState(() {
      _executionState = ComponentExecutionState.successful;
      _loadingVisible = false;
      _isPressed = false;
    });
    _syncLoadingController();
    _successResetTimer?.cancel();
    _successResetTimer = Timer(_successDisplayDuration, () {
      if (!mounted) return;
      _clearExecutionState();
    });
  }
}
