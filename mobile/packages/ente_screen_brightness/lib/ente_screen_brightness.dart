import "dart:io";

import "package:flutter/services.dart";

/// Temporarily controls the iOS display brightness for the current app.
///
/// iOS exposes display brightness through `UIScreen`, not as a true per-app
/// value. The native plugin captures the brightness before the first change
/// and [restore] returns the display to that value.
class EnteScreenBrightness {
  EnteScreenBrightness._();

  static const MethodChannel _channel = MethodChannel(
    "io.ente.screen_brightness",
  );

  /// Dims the iOS display to at most a normalized [value] from 0 to 1.
  ///
  /// If the display is already dimmer than [value], its brightness is left
  /// unchanged so this API never makes the user's screen brighter.
  ///
  /// The first call captures the current brightness. Later calls do not
  /// replace that captured value, so [restore] always returns to the
  /// brightness from before this dimming session.
  ///
  /// Returns whether the brightness was applied. This is a no-op on non-iOS
  /// platforms and while the iOS app is not active.
  static Future<bool> setBrightness(double value) async {
    if (!value.isFinite || value < 0 || value > 1) {
      throw RangeError.range(value, 0, 1, "value");
    }
    if (!Platform.isIOS) {
      return false;
    }
    return await _channel.invokeMethod<bool>("setBrightness", value) ?? false;
  }

  /// Restores the brightness captured by the first [setBrightness] call.
  ///
  /// Calling this without an active dimming session has no effect. This is a
  /// no-op on non-iOS platforms.
  static Future<void> restore() async {
    if (!Platform.isIOS) {
      return;
    }
    await _channel.invokeMethod<void>("restoreBrightness");
  }
}
