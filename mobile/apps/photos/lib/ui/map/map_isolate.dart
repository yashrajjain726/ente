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
}

class _ProjectedMarkerGroup {
  final int imageIndex;
  final double latitude;
  final double longitude;
  final double x;
  final double y;
  int imageCount = 1;

  _ProjectedMarkerGroup({
    required this.imageIndex,
    required this.latitude,
    required this.longitude,
    required this.x,
    required this.y,
  });

  MapMarkerGroup toMarkerGroup() => MapMarkerGroup(
    imageIndex: imageIndex,
    latitude: latitude,
    longitude: longitude,
    imageCount: imageCount,
  );
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

const double _minimumMarkerDistancePixels = 100;
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
    final groupsByCell = <(int, int), List<_ProjectedMarkerGroup>>{};
    final groups = <_ProjectedMarkerGroup>[];
    final scale = _webMercatorTileSize * pow(2, message.zoom).toDouble();

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
      final cell = (
        (x / _minimumMarkerDistancePixels).floor(),
        (y / _minimumMarkerDistancePixels).floor(),
      );
      _ProjectedMarkerGroup? closestGroup;
      var closestDistanceSquared = double.infinity;

      for (var xOffset = -1; xOffset <= 1; xOffset++) {
        for (var yOffset = -1; yOffset <= 1; yOffset++) {
          final nearbyGroups =
              groupsByCell[(cell.$1 + xOffset, cell.$2 + yOffset)];
          if (nearbyGroups == null) {
            continue;
          }

          for (final group in nearbyGroups) {
            final xDistance = x - group.x;
            final yDistance = y - group.y;
            final distanceSquared =
                xDistance * xDistance + yDistance * yDistance;
            if (distanceSquared <=
                    _minimumMarkerDistancePixels *
                        _minimumMarkerDistancePixels &&
                distanceSquared < closestDistanceSquared) {
              closestGroup = group;
              closestDistanceSquared = distanceSquared;
            }
          }
        }
      }

      if (closestGroup != null) {
        closestGroup.imageCount++;
        continue;
      }

      final group = _ProjectedMarkerGroup(
        imageIndex: point.imageIndex,
        latitude: point.latitude,
        longitude: point.longitude,
        x: x,
        y: y,
      );
      groups.add(group);
      groupsByCell.putIfAbsent(cell, () => []).add(group);
    }

    init.sendPort.send(
      MapViewportResult(
        id: message.id,
        visibleImageIndexes: visibleIndexes,
        markerGroups: groups
            .map((group) => group.toMarkerGroup())
            .toList(growable: false),
      ),
    );
  });
}
