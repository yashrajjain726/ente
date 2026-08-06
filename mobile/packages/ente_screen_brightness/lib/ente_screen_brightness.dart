import "dart:io";

import "package:flutter/services.dart";

class EnteScreenBrightness {
  EnteScreenBrightness._();

  static const MethodChannel _channel = MethodChannel(
    "io.ente.screen_brightness",
  );

  static Future<bool> setBrightness(double value) async {
    if (!value.isFinite || value < 0 || value > 1) {
      throw RangeError.range(value, 0, 1, "value");
    }
    if (!Platform.isIOS) {
      return false;
    }
    return await _channel.invokeMethod<bool>("setBrightness", value) ?? false;
  }

  static Future<void> restore() async {
    if (!Platform.isIOS) {
      return;
    }
    await _channel.invokeMethod<void>("restoreBrightness");
  }
}
