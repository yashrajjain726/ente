import "dart:io";
import "dart:math";
import "dart:typed_data";
import "dart:ui";

import "package:image/image.dart" as img;
import "package:logging/logging.dart";
import "package:photos/models/file/file.dart";
import "package:photos/utils/file_util.dart";
import "package:pro_image_editor/pro_image_editor.dart";

final _logger = Logger("lossless_edits");

Future<Uint8List?> tryRotateFileLossless(EnteFile src, int turns) async {
  try {
    return await _rotateFileLossless(src, turns);
  } catch (e, s) {
    _logger.warning("Failed to rotate file losslessly", e, s);
    return null;
  }
}

Future<Uint8List> _rotateFileLossless(EnteFile src, int turns) async {
  File? f;
  try {
    f = await getFile(src, isOrigin: true);
    if (f == null) {
      throw Exception("Failed to get file");
    }
    final bytes = await f.readAsBytes();
    final exif = img.decodeJpgExif(bytes);
    if (exif == null) {
      throw Exception("Failed to decode JPEG EXIF");
    }
    _applyRotationToExif(exif, turns);
    final out = img.injectJpgExif(bytes, exif);
    if (out == null) {
      throw Exception("Failed to inject JPEG EXIF");
    }
    return out;
  } finally {
    if (f != null && !src.isRemoteOnlyFile && Platform.isIOS) {
      f.delete().ignore();
    }
  }
}

void _applyRotationToExif(img.ExifData exif, int turns) {
  final originalTurns = _orientationToTurns(exif.imageIfd.orientation);
  if (originalTurns == null) {
    throw Exception("Unsupported EXIF orientation");
  }
  final updatedTurns = (originalTurns + turns) % 4;
  final updatedOrientation = _turnsToOrientation(updatedTurns);
  exif.imageIfd.orientation = updatedOrientation;
}

int? _orientationToTurns(int? orientation) {
  return switch (orientation ?? 1) {
    1 => 0,
    6 => 1,
    3 => 2,
    8 => 3,
    _ => null,
  };
}

int _turnsToOrientation(int turns) {
  return switch ((turns % 4 + 4) % 4) {
    1 => 6,
    2 => 3,
    3 => 8,
    _ => 1,
  };
}

bool isTransformOnlyRotation(TransformConfigs t) {
  final fullImageRect = Rect.fromLTWH(
    0,
    0,
    t.originalSize.width,
    t.originalSize.height,
  );

  final isRotationOnly =
      t.originalSize.width.isFinite &&
      t.originalSize.height.isFinite &&
      t.cropRect.left.isFinite &&
      t.cropRect.top.isFinite &&
      t.cropRect.right.isFinite &&
      t.cropRect.bottom.isFinite &&
      t.angle != 0 &&
      t.isRectangularCropper &&
      _isSameRect(t.cropRect, fullImageRect) &&
      _isSameDouble(t.scaleUser, 1) &&
      t.aspectRatio == -1 &&
      t.flipX == false &&
      t.flipY == false &&
      _isSameOffset(t.offset, Offset.zero);

  return isRotationOnly;
}

int? getTurnsIfOnlyRotated(ProImageEditorState editorState) {
  final stateManager = editorState.stateManager;

  if (stateManager.activeLayers.isNotEmpty) {
    return null;
  }

  final blur = stateManager.activeBlur;
  final filters = stateManager.activeFilters;
  final tuneAdjustments = stateManager.activeTuneAdjustments;
  final transformConfigs = stateManager.transformConfigs;

  if (blur != 0.0 || filters.isNotEmpty || tuneAdjustments.isNotEmpty) {
    return null;
  }

  if (!isTransformOnlyRotation(transformConfigs)) return null;

  const quarterTurn = pi / 2;
  final rotations = transformConfigs.angle / quarterTurn;

  if (rotations != rotations.roundToDouble()) {
    return null;
  }

  return rotations.toInt();
}

bool _isSameDouble(double a, double b) {
  return (a - b).abs() < 0.01;
}

bool _isSameOffset(Offset a, Offset b) {
  return _isSameDouble(a.dx, b.dx) && _isSameDouble(a.dy, b.dy);
}

bool _isSameRect(Rect a, Rect b) {
  return _isSameDouble(a.left, b.left) &&
      _isSameDouble(a.top, b.top) &&
      _isSameDouble(a.right, b.right) &&
      _isSameDouble(a.bottom, b.bottom);
}
