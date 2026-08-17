import "dart:isolate";
import "dart:math";

import "package:flutter_map/flutter_map.dart";
import "package:latlong2/latlong.dart";

class MapPoint {
  final int imageIndex;
  final double latitude;
  final double longitude;

  const MapPoint({
    required this.imageIndex,
    required this.latitude,
    required this.longitude,
  });
}

class MapMarkerGroup {
  final int imageIndex;
  final double latitude;
  final double longitude;
  final int imageCount;

  const MapMarkerGroup({
    required this.imageIndex,
    required this.latitude,
    required this.longitude,
    required this.imageCount,
  });

  MapMarkerGroup withIncrementedCount() {
    return MapMarkerGroup(
      imageIndex: imageIndex,
      latitude: latitude,
      longitude: longitude,
      imageCount: imageCount + 1,
    );
  }
}

class MapWorkerInit {
  final List<MapPoint> points;
  final SendPort sendPort;

  const MapWorkerInit({required this.points, required this.sendPort});
}

class MapViewportRequest {
  final int id;
  final LatLngBounds bounds;
  final double zoom;

  const MapViewportRequest({
    required this.id,
    required this.bounds,
    required this.zoom,
  });
}

class MapViewportResult {
  final int id;
  final List<int> visibleImageIndexes;
  final List<MapMarkerGroup> markerGroups;

  const MapViewportResult({
    required this.id,
    required this.visibleImageIndexes,
    required this.markerGroups,
  });
}

const double _markerBucketSizePixels = 64;
const double _webMercatorTileSize = 256;
const double _mercatorLatitudeLimit = 85.05112878;

void mapWorker(MapWorkerInit init) {
  final receivePort = ReceivePort();
  init.sendPort.send(receivePort.sendPort);
  receivePort.listen((message) {
    if (message is! MapViewportRequest) {
      return;
    }

    final visibleIndexes = <int>[];
    final groups = <(int, int), MapMarkerGroup>{};
    final scale = _webMercatorTileSize * pow(2, message.zoom);

    for (final point in init.points) {
      final latLng = LatLng(point.latitude, point.longitude);
      if (!message.bounds.contains(latLng)) {
        continue;
      }

      visibleIndexes.add(point.imageIndex);
      final latitude = point.latitude.clamp(
        -_mercatorLatitudeLimit,
        _mercatorLatitudeLimit,
      );
      final sinLatitude = sin(latitude * pi / 180);
      final x = (point.longitude + 180) / 360 * scale;
      final y =
          (0.5 - log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * pi)) * scale;
      final key = (
        (x / _markerBucketSizePixels).floor(),
        (y / _markerBucketSizePixels).floor(),
      );
      final group = groups[key];
      groups[key] = group == null
          ? MapMarkerGroup(
              imageIndex: point.imageIndex,
              latitude: point.latitude,
              longitude: point.longitude,
              imageCount: 1,
            )
          : group.withIncrementedCount();
    }

    init.sendPort.send(
      MapViewportResult(
        id: message.id,
        visibleImageIndexes: visibleIndexes,
        markerGroups: groups.values.toList(growable: false),
      ),
    );
  });
}
