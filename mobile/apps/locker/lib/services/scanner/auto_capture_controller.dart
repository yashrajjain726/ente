import 'package:locker/services/scanner/scanner_models.dart';

enum AutoCaptureState { searching, arming, cooldown }

class AutoCaptureController {
  static const armHold = Duration(milliseconds: 1500);

  static const armGrace = Duration(milliseconds: 250);

  static const clearHold = Duration(milliseconds: 700);

  static const minAreaFraction = 0.15;

  AutoCaptureState _state = AutoCaptureState.searching;
  double _progress = 0;
  Duration _armedElapsed = Duration.zero;
  Duration _graceElapsed = Duration.zero;
  Duration _clearElapsed = Duration.zero;
  Duration? _lastFrameAt;

  AutoCaptureState get state => _state;

  double get progress => _progress;

  bool onFrame(
    ScanQuad? stableQuad, {
    required bool captureBusy,
    required Duration timestamp,
    bool resetProgress = false,
  }) {
    final last = _lastFrameAt;
    if (timestamp.isNegative || (last != null && timestamp <= last)) {
      invalidateArming();
      return false;
    }
    _lastFrameAt = timestamp;
    final dt = last == null || resetProgress ? Duration.zero : timestamp - last;
    if (resetProgress) {
      invalidateArming();
      _clearElapsed = Duration.zero;
    }

    final eligible =
        !captureBusy &&
        stableQuad != null &&
        stableQuad.area >= minAreaFraction;

    switch (_state) {
      case AutoCaptureState.searching:
        if (eligible) {
          _state = AutoCaptureState.arming;
          _progress = 0;
          _armedElapsed = Duration.zero;
          _graceElapsed = Duration.zero;
        }
        return false;
      case AutoCaptureState.arming:
        if (eligible) {
          _graceElapsed = Duration.zero;
          _armedElapsed += dt;
          _progress = _armedElapsed.inMicroseconds / armHold.inMicroseconds;
          if (_armedElapsed >= armHold) {
            notifyCaptureStarted();
            return true;
          }
        } else {
          _graceElapsed += dt;
          if (_graceElapsed >= armGrace) {
            _state = AutoCaptureState.searching;
            _progress = 0;
          }
        }
        return false;
      case AutoCaptureState.cooldown:
        if (stableQuad != null || captureBusy) {
          _clearElapsed = Duration.zero;
        } else {
          _clearElapsed += dt;
          if (_clearElapsed >= clearHold) {
            _state = AutoCaptureState.searching;
          }
        }
        return false;
    }
  }

  void notifyCaptureStarted() {
    _state = AutoCaptureState.cooldown;
    _progress = 0;
    _armedElapsed = Duration.zero;
    _clearElapsed = Duration.zero;
  }

  void invalidateArming() {
    if (_state != AutoCaptureState.arming) return;
    _state = AutoCaptureState.searching;
    _progress = 0;
    _armedElapsed = Duration.zero;
    _graceElapsed = Duration.zero;
  }

  void reset() {
    _state = AutoCaptureState.searching;
    _progress = 0;
    _armedElapsed = Duration.zero;
    _graceElapsed = Duration.zero;
    _clearElapsed = Duration.zero;
    _lastFrameAt = null;
  }
}
