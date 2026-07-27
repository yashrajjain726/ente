import "dart:math";

import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:logging/logging.dart";
import "package:path/path.dart";
import "package:photo_manager/photo_manager.dart";
import "package:photos/core/constants.dart";

final _logger = Logger("AssetDateTimes");

// Dart DateTime accepts +/- 8.64e15 milliseconds; photo_manager exposes
// timestamps as whole seconds.
const _maxDateTimeSecondsSinceEpoch = 8640000000000;
const _minDateTimeSecondsSinceEpoch = -_maxDateTimeSecondsSinceEpoch;

typedef AssetDateTimes = ({int creationTime, int modificationTime});

/// Compares at the whole-second precision provided by photo_manager.
bool isAssetAtOrAfterSyncCutoff(AssetDateTimes dateTimes, int cutoffTime) {
  final latestAssetTimeSecond =
      max(dateTimes.creationTime, dateTimes.modificationTime) ~/
      Duration.microsecondsPerSecond;
  final cutoffTimeSecond = cutoffTime ~/ Duration.microsecondsPerSecond;
  return latestAssetTimeSecond >= cutoffTimeSecond;
}

AssetDateTimes resolveAssetDateTimes(AssetEntity asset) {
  final uploadTime = DateTime.now().toUtc().microsecondsSinceEpoch;
  final creationTime = _validMicrosecondsSinceEpoch(asset.createDateSecond);
  final modificationTime = _validMicrosecondsSinceEpoch(
    asset.modifiedDateSecond,
  );

  if (creationTime == null && modificationTime == null) {
    _logger.warning(
      "Asset creation and modification times are invalid; using upload time",
    );
    return (creationTime: uploadTime, modificationTime: uploadTime);
  }
  if (creationTime == null) {
    _logger.info(
      "Asset creation time is invalid; resolving from modification time",
    );
    final resolvedCreationTime = _resolveCreationTime(
      asset,
      modificationTime!,
      modificationTime,
      uploadTime,
    );
    return (
      creationTime: resolvedCreationTime,
      modificationTime: modificationTime,
    );
  }
  if (modificationTime == null) {
    _logger.info("Asset modification time is invalid; using creation time");
    final resolvedCreationTime = _resolveCreationTime(
      asset,
      creationTime,
      creationTime,
      uploadTime,
    );
    return (
      creationTime: resolvedCreationTime,
      modificationTime: resolvedCreationTime,
    );
  }

  return (
    creationTime: _resolveCreationTime(
      asset,
      creationTime,
      modificationTime,
      uploadTime,
    ),
    modificationTime: modificationTime,
  );
}

int _resolveCreationTime(
  AssetEntity asset,
  int creationTime,
  int modificationTime,
  int uploadTime,
) {
  var resolvedCreationTime = creationTime;
  if (creationTime >= jan011981Time) {
    // Copied files can retain an older modification time while gaining a new
    // filesystem creation time. Embedded metadata may replace this on upload.
    if (modificationTime >= jan011981Time && modificationTime < creationTime) {
      _logger.info(
        "Asset modification time is less than creation time. "
        "Using modification time as creation time",
      );
      resolvedCreationTime = modificationTime;
    }
    return resolvedCreationTime;
  }

  resolvedCreationTime = modificationTime >= jan011981Time
      ? modificationTime
      : uploadTime;
  try {
    final parsedDateTime = parseDateTimeFromFileNameV2(
      basenameWithoutExtension(asset.title ?? ""),
    );
    return parsedDateTime?.microsecondsSinceEpoch ?? resolvedCreationTime;
  } catch (_) {
    return resolvedCreationTime;
  }
}

int? _validMicrosecondsSinceEpoch(int? secondsSinceEpoch) {
  if (secondsSinceEpoch == null ||
      secondsSinceEpoch < _minDateTimeSecondsSinceEpoch ||
      secondsSinceEpoch > _maxDateTimeSecondsSinceEpoch) {
    return null;
  }
  return secondsSinceEpoch * Duration.microsecondsPerSecond;
}
