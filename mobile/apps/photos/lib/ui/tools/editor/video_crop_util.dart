import 'dart:ui';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:photos/ui/tools/editor/video_editor/ente_video_editor_controller.dart';

class CropCalculation {
  const CropCalculation({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final int x;
  final int y;
  final int width;
  final int height;

  /// FFmpeg crop filter string: crop=w:h:x:y
  String toFFmpegFilter() => 'crop=$width:$height:$x:$y';
}

class VideoCropException implements Exception {
  VideoCropException(this.message);
  final String message;

  @override
  String toString() => 'VideoCropException: $message';
}

/// Helpers to derive display- and file-space crop rectangles for native export
class VideoCropUtil {
  static double _clampNormalized(double value) {
    return value.clamp(0.0, 1.0);
  }

  /// Calculate the crop rectangle in display-space pixels.
  ///
  /// Returns a Rect in display-space so the native plugins can transform to file-space.
  static Rect calculateDisplaySpaceCropRect({
    required EnteVideoEditorController controller,
  }) {
    return calculateDisplaySpaceCropRectFromData(
      minCrop: controller.minCrop,
      maxCrop: controller.maxCrop,
      videoSize: controller.sourceDisplaySize,
    );
  }

  /// Testability helper: bypasses controller and platform checks by accepting
  /// raw crop data. Only used in unit tests.
  @visibleForTesting
  static Rect calculateDisplaySpaceCropRectFromData({
    required Offset minCrop,
    required Offset maxCrop,
    required Size videoSize,
  }) {
    double minX = _clampNormalized(minCrop.dx);
    double maxX = _clampNormalized(maxCrop.dx);
    double minY = _clampNormalized(minCrop.dy);
    double maxY = _clampNormalized(maxCrop.dy);

    if (minX > maxX) {
      final temp = minX;
      minX = maxX;
      maxX = temp;
    }
    if (minY > maxY) {
      final temp = minY;
      minY = maxY;
      maxY = temp;
    }

    final widthNormalized = maxX - minX;
    final heightNormalized = maxY - minY;

    if (widthNormalized <= 0 || heightNormalized <= 0) {
      throw VideoCropException('Invalid crop selection: zero or negative span');
    }

    final sourceWidth = videoSize.width.round();
    final sourceHeight = videoSize.height.round();
    final x = (minX * sourceWidth).round().clamp(0, sourceWidth);
    final y = (minY * sourceHeight).round().clamp(0, sourceHeight);
    var right = (maxX * sourceWidth).round().clamp(x, sourceWidth);
    var bottom = (maxY * sourceHeight).round().clamp(y, sourceHeight);
    if ((right - x).isOdd) {
      right += right < sourceWidth ? 1 : -1;
    }
    if ((bottom - y).isOdd) {
      bottom += bottom < sourceHeight ? 1 : -1;
    }
    final w = right - x;
    final h = bottom - y;

    if (w <= 0 || h <= 0) {
      throw VideoCropException('Invalid crop rectangle after scaling');
    }

    return Rect.fromLTWH(
      x.toDouble(),
      y.toDouble(),
      w.toDouble(),
      h.toDouble(),
    );
  }

  /// Convert the normalised crop selection into file-space coordinates.
  static CropCalculation calculateFileSpaceCrop({
    required EnteVideoEditorController controller,
  }) {
    final crop = calculateDisplaySpaceCropRect(controller: controller);
    return CropCalculation(
      x: crop.left.toInt(),
      y: crop.top.toInt(),
      width: crop.width.toInt(),
      height: crop.height.toInt(),
    );
  }
}
