import "package:flutter/material.dart";

const double kMemoryProgressSegmentWidth = 8.0;
const double kMemoryProgressGap = 10.0;
const double kMemoryProgressHeight = 4.0;
const double kMemoryProgressMinimumCurrentWidth = 24.0;

int memoryProgressCapacityForWidth(
  double availableWidth, {
  double segmentWidth = kMemoryProgressSegmentWidth,
  double gap = kMemoryProgressGap,
  double minimumCurrentWidth = kMemoryProgressMinimumCurrentWidth,
}) {
  if (!availableWidth.isFinite ||
      availableWidth <= 0 ||
      !segmentWidth.isFinite ||
      segmentWidth <= 0 ||
      !gap.isFinite ||
      gap < 0 ||
      !minimumCurrentWidth.isFinite ||
      minimumCurrentWidth <= 0) {
    return 1;
  }

  final capacity =
      1 +
      ((availableWidth - minimumCurrentWidth) / (segmentWidth + gap)).floor();
  return capacity < 1 ? 1 : capacity;
}

bool memoryProgressUsesContinuousTrack({
  required int totalSteps,
  required double availableWidth,
  double segmentWidth = kMemoryProgressSegmentWidth,
  double gap = kMemoryProgressGap,
  double minimumCurrentWidth = kMemoryProgressMinimumCurrentWidth,
}) =>
    totalSteps >
    memoryProgressCapacityForWidth(
      availableWidth,
      segmentWidth: segmentWidth,
      gap: gap,
      minimumCurrentWidth: minimumCurrentWidth,
    );

class MemoryProgressIndicator extends StatefulWidget {
  final int totalSteps;
  final int currentIndex;
  final Duration duration;
  final Color selectedColor;
  final Color unselectedColor;
  final double height;
  final double gap;
  final void Function(AnimationController)? animationController;
  final void Function(AnimationController)? onAnimationControllerDisposed;
  final VoidCallback? onComplete;

  const MemoryProgressIndicator({
    super.key,
    required this.totalSteps,
    required this.currentIndex,
    this.duration = const Duration(seconds: 5),
    this.selectedColor = Colors.white,
    this.unselectedColor = Colors.white54,
    this.height = kMemoryProgressHeight,
    this.gap = kMemoryProgressGap,
    this.animationController,
    this.onAnimationControllerDisposed,
    this.onComplete,
  });

  @override
  State<MemoryProgressIndicator> createState() =>
      _MemoryProgressIndicatorState();
}

class _MemoryProgressIndicatorState extends State<MemoryProgressIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: widget.duration,
      animationBehavior: AnimationBehavior.preserve,
    );

    _animation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(_animationController);

    if (widget.animationController != null) {
      widget.animationController!(_animationController);
    }

    _animationController.addStatusListener((status) {
      if (status == AnimationStatus.completed && widget.onComplete != null) {
        widget.onComplete!();
      }
    });
  }

  @override
  void dispose() {
    widget.onAnimationControllerDisposed?.call(_animationController);
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (memoryProgressUsesContinuousTrack(
          totalSteps: widget.totalSteps,
          availableWidth: constraints.maxWidth,
          gap: widget.gap,
        )) {
          return AnimatedBuilder(
            animation: _animation,
            builder: (context, _) {
              final progress =
                  (widget.currentIndex + _animation.value) / widget.totalSteps;
              return LinearProgressIndicator(
                value: progress.clamp(0.0, 1.0),
                backgroundColor: widget.unselectedColor,
                valueColor: AlwaysStoppedAnimation<Color>(widget.selectedColor),
                minHeight: widget.height,
                borderRadius: BorderRadius.circular(12),
              );
            },
          );
        }

        final segments = <Widget>[];
        for (var index = 0; index < widget.totalSteps; index++) {
          if (index > 0) {
            segments.add(SizedBox(width: widget.gap));
          }

          final segment = index == widget.currentIndex
              ? AnimatedBuilder(
                  animation: _animation,
                  builder: (context, _) {
                    return LinearProgressIndicator(
                      value: _animation.value,
                      backgroundColor: widget.unselectedColor,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        widget.selectedColor,
                      ),
                      minHeight: widget.height,
                      borderRadius: BorderRadius.circular(12),
                    );
                  },
                )
              : Container(
                  height: widget.height,
                  decoration: BoxDecoration(
                    color: index < widget.currentIndex
                        ? widget.selectedColor
                        : widget.unselectedColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                );

          segments.add(
            index == widget.currentIndex
                ? Expanded(child: segment)
                : SizedBox(width: kMemoryProgressSegmentWidth, child: segment),
          );
        }
        return Row(children: segments);
      },
    );
  }
}
