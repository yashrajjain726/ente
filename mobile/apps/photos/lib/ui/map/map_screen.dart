import "dart:async";
import "dart:isolate";

import "package:computer/computer.dart";
import "package:ente_strings/ente_strings.dart";
import "package:ente_ui/components/loading_widget.dart";
import "package:flutter/foundation.dart";
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import "package:latlong2/latlong.dart";
import "package:logging/logging.dart";
import 'package:photos/models/file/file.dart';
import "package:photos/models/location/location.dart";
import "package:photos/theme/ente_theme.dart";
import "package:photos/ui/map/image_marker.dart";
import "package:photos/ui/map/map_isolate.dart";
import "package:photos/ui/map/map_pull_up_gallery.dart";
import "package:photos/ui/map/map_view.dart";
import "package:photos/ui/notification/toast.dart";

class MapScreen extends StatefulWidget {
  final Future<List<EnteFile>> Function() filesFutureFn;
  final LatLng? center;
  final double initialZoom;

  const MapScreen({
    super.key,
    required this.filesFutureFn,
    this.center,
    this.initialZoom = 4.5,
  });

  @override
  State<StatefulWidget> createState() {
    return _MapScreenState();
  }
}

class _MapScreenState extends State<MapScreen> {
  List<ImageMarker> imageMarkers = [];
  List<EnteFile> allImages = [];
  StreamController<List<EnteFile>> visibleImages =
      StreamController<List<EnteFile>>.broadcast();
  MapController mapController = MapController();
  bool isLoading = true;
  bool hasLocationData = true;
  double maxZoom = 18.0;
  double minZoom = 2.8;
  late LatLng center;
  final Logger _logger = Logger("_MapScreenState");
  ReceivePort? _mapWorkerReceivePort;
  StreamSubscription? _mapWorkerSubscription;
  SendPort? _mapWorkerSendPort;
  Isolate? _mapWorkerIsolate;
  static const bottomSheetDraggableAreaHeight = 32.0;
  List<int>? _previousVisibleIndexes;
  int _viewportRequestID = 0;

  @override
  void initState() {
    super.initState();
    initialize();
  }

  @override
  void dispose() {
    unawaited(_mapWorkerSubscription?.cancel());
    _mapWorkerReceivePort?.close();
    _mapWorkerIsolate?.kill();
    unawaited(visibleImages.close());
    super.dispose();
  }

  Future<void> initialize() async {
    try {
      center = widget.center ?? const LatLng(46.7286, 4.8614);
      allImages = await widget.filesFutureFn();
      await processFiles(allImages);
    } catch (e, s) {
      _logger.severe("Error initializing map screen", e, s);
    }
  }

  Future<void> processFiles(List<EnteFile> files) async {
    final result = await Computer.shared().compute(
      _findRecentImageAndMapPoints,
      param: {"files": files, "center": widget.center},
    );

    final int? mostRecentImageIndex = result.$1;
    final List<MapPoint> mapPoints = result.$2;

    if (mapPoints.isEmpty) {
      if (!mounted) return;
      showShortToast(context, context.strings.noImagesWithLocation);
      if (!visibleImages.isClosed) {
        visibleImages.sink.add([]);
      }
      if (!mounted) {
        return;
      }
      setState(() {
        hasLocationData = false;
        imageMarkers = [];
        isLoading = false;
      });
      return;
    }

    center =
        widget.center ??
        LatLng(
          allImages[mostRecentImageIndex!].location!.latitude!,
          allImages[mostRecentImageIndex].location!.longitude!,
        );

    if (kDebugMode) {
      debugPrint(
        "Info for map: center $center, initialZoom ${widget.initialZoom}",
      );
    }

    await _startMapWorker(mapPoints);
    if (!mounted) return;
    setState(() {
      hasLocationData = true;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      mapController.move(center, widget.initialZoom);
      _requestViewport(
        mapController.camera.visibleBounds,
        mapController.camera.zoom,
      );
    });
  }

  Future<void> _startMapWorker(List<MapPoint> mapPoints) async {
    _mapWorkerReceivePort = ReceivePort();
    final sendPortCompleter = Completer<SendPort>();
    _mapWorkerSubscription = _mapWorkerReceivePort!.listen((message) {
      if (message is SendPort) {
        _mapWorkerSendPort = message;
        if (!sendPortCompleter.isCompleted) {
          sendPortCompleter.complete(message);
        }
      } else if (message is MapViewportResult) {
        _applyViewportResult(message);
      }
    });
    _mapWorkerIsolate = await Isolate.spawn(
      mapWorker,
      MapWorkerInit(
        points: mapPoints,
        sendPort: _mapWorkerReceivePort!.sendPort,
      ),
    );
    await sendPortCompleter.future;
  }

  void _requestViewport(LatLngBounds bounds, double zoom) {
    final sendPort = _mapWorkerSendPort;
    if (sendPort == null) return;
    sendPort.send(
      MapViewportRequest(id: ++_viewportRequestID, bounds: bounds, zoom: zoom),
    );
  }

  void _applyViewportResult(MapViewportResult result) {
    if (!mounted || result.id != _viewportRequestID) return;

    final visibleIndexes = result.visibleImageIndexes;
    if (!_sameIndexes(visibleIndexes, _previousVisibleIndexes)) {
      _previousVisibleIndexes = visibleIndexes;
      if (!visibleImages.isClosed) {
        visibleImages.add(
          visibleIndexes
              .map((index) => allImages[index])
              .toList(growable: false),
        );
      }
    }

    setState(() {
      imageMarkers = result.markerGroups
          .map(
            (group) => ImageMarker(
              imageFile: allImages[group.imageIndex],
              latitude: group.latitude,
              longitude: group.longitude,
              imageCount: group.imageCount,
            ),
          )
          .toList(growable: false);
      isLoading = false;
    });
  }

  bool _sameIndexes(List<int> current, List<int>? previous) {
    if (previous == null || current.length != previous.length) return false;
    for (var i = 0; i < current.length; i++) {
      if (current[i] != previous[i]) return false;
    }
    return true;
  }

  static (int?, List<MapPoint>) _findRecentImageAndMapPoints(
    Map<String, dynamic> args,
  ) {
    final Logger logger = Logger("_MapScreenState");
    final files = args["files"] as List<EnteFile>;
    final center = args["center"] as LatLng?;
    final List<MapPoint> mapPoints = [];
    int? mostRecentImageIndex;

    for (var index = 0; index < files.length; index++) {
      final file = files[index];
      if (file.hasLocation) {
        if (!Location.isValidRange(
          latitude: file.location!.latitude!,
          longitude: file.location!.longitude!,
        )) {
          logger.warning(
            'Skipping file with invalid location ${file.toString()}',
          );
          continue;
        }

        if (center == null) {
          if (mostRecentImageIndex == null) {
            mostRecentImageIndex = index;
          } else {
            final mostRecentFile = files[mostRecentImageIndex];
            if ((mostRecentFile.creationTime ?? 0) < (file.creationTime ?? 0)) {
              mostRecentImageIndex = index;
            }
          }
        }

        mapPoints.add(
          MapPoint(
            imageIndex: index,
            latitude: file.location!.latitude!,
            longitude: file.location!.longitude!,
          ),
        );
      }
    }

    return (mostRecentImageIndex, mapPoints);
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = getEnteColorScheme(context);
    final bottomUnsafeArea = MediaQuery.of(context).padding.bottom;
    return Container(
      color: colorScheme.backgroundColour,
      child: Theme(
        data: Theme.of(context).copyWith(
          bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: Colors.transparent,
          ),
        ),
        child: Scaffold(
          body: Stack(
            children: [
              LayoutBuilder(
                builder: (context, constrains) {
                  return SizedBox(
                    height:
                        constrains.maxHeight * 0.75 +
                        bottomSheetDraggableAreaHeight -
                        bottomUnsafeArea,
                    child: MapView(
                      controller: mapController,
                      imageMarkers: imageMarkers,
                      updateVisibleImages: _requestViewport,
                      center: center,
                      initialZoom: widget.initialZoom,
                      minZoom: minZoom,
                      maxZoom: maxZoom,
                      bottomSheetDraggableAreaHeight:
                          bottomSheetDraggableAreaHeight,
                    ),
                  );
                },
              ),
              isLoading
                  ? EnteLoadingWidget(
                      size: 28,
                      color: getEnteColorScheme(context).primary700,
                    )
                  : const SizedBox.shrink(),
            ],
          ),
          bottomSheet: MapPullUpGallery(
            visibleImages,
            bottomSheetDraggableAreaHeight,
            bottomUnsafeArea,
            hasLocationData: hasLocationData,
          ),
        ),
      ),
    );
  }
}
