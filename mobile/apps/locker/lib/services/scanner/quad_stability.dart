import 'package:locker/services/scanner/scanner_models.dart';

class QuadStabilitySample {
  const QuadStabilitySample({
    required this.quad,
    required this.resetCapture,
    this.displayQuad,
    this.validUntil,
  });

  final ScanQuad? quad;
  final ScanQuad? displayQuad;
  final bool resetCapture;
  final Duration? validUntil;
}

class QuadStability {
  static const minimumFreshness = Duration(milliseconds: 600);
  static const maximumFreshness = Duration(milliseconds: 1500);
  static const maximumRelativeMotion = 0.04;

  ScanQuad? _anchor;
  ScanQuad? _previous;
  Duration? _lastObservation;
  Duration? _displayUntil;
  int? _rotation;
  Duration _freshness = minimumFreshness;

  QuadStabilitySample update(
    ScanQuad? detection, {
    required Duration observedAt,
    required Duration now,
    required int rotationDegrees,
  }) {
    final age = now - observedAt;
    final previousTime = _lastObservation;
    final invalidTime =
        age.isNegative ||
        age >= maximumFreshness ||
        observedAt.isNegative ||
        (previousTime != null && observedAt <= previousTime);
    if (invalidTime || rotationDegrees % 90 != 0) {
      reset();
      _lastObservation = previousTime;
      return const QuadStabilitySample(quad: null, resetCapture: true);
    }
    final observationWindow = Duration(
      microseconds: (age.inMicroseconds * 5 ~/ 2).clamp(
        minimumFreshness.inMicroseconds,
        maximumFreshness.inMicroseconds,
      ),
    );
    final gapLimit = observationWindow > _freshness
        ? observationWindow
        : _freshness;
    final rotation = rotationDegrees % 360;
    final interrupted =
        _rotation != null &&
        (_rotation != rotation || observedAt - previousTime! > gapLimit);
    if (interrupted) reset();
    _freshness = observationWindow;
    _lastObservation = observedAt;
    _rotation = rotation;
    if (detection == null) {
      if (_displayUntil != null && now >= _displayUntil!) {
        _anchor = null;
        _previous = null;
        _displayUntil = null;
      }
      return QuadStabilitySample(
        quad: null,
        displayQuad: _previous,
        resetCapture: interrupted,
        validUntil: _displayUntil,
      );
    }
    final previous = _previous;
    final aligned = previous == null
        ? detection
        : detection.alignedTo(previous);
    final anchor = _anchor;
    final moved =
        anchor != null &&
        aligned.relativeMotionTo(anchor) > maximumRelativeMotion;
    if (anchor == null || moved) _anchor = aligned;
    _previous = aligned;
    _displayUntil = observedAt + observationWindow;
    return QuadStabilitySample(
      quad: aligned,
      displayQuad: aligned,
      resetCapture: interrupted || moved,
      validUntil: _displayUntil,
    );
  }

  void reset({Duration? observedBefore}) {
    _anchor = null;
    _previous = null;
    _lastObservation = observedBefore;
    _displayUntil = null;
    _rotation = null;
    _freshness = minimumFreshness;
  }
}
