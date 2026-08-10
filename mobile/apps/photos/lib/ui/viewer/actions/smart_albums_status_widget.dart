import "dart:async";

import "package:ente_strings/ente_strings.dart";
import "package:ente_ui/components/fading_circle_progress_indicator.dart";
import 'package:flutter/material.dart';
import "package:photos/core/event_bus.dart";
import "package:photos/events/smart_album_syncing_event.dart";
import 'package:photos/models/collection/collection.dart';
import "package:photos/service_locator.dart";
import "package:photos/theme/ente_theme.dart";

class SmartAlbumsStatusWidget extends StatefulWidget {
  final Collection? collection;

  const SmartAlbumsStatusWidget({this.collection, super.key});

  @override
  State<SmartAlbumsStatusWidget> createState() =>
      _SmartAlbumsStatusWidgetState();
}

class _SmartAlbumsStatusWidgetState extends State<SmartAlbumsStatusWidget> {
  (int, bool)? _syncingCollection;
  StreamSubscription<SmartAlbumSyncingEvent>? subscription;

  void updateData(SmartAlbumSyncingEvent event) {
    if (mounted) {
      setState(() {
        if (event.collectionId != null) {
          _syncingCollection = (event.collectionId!, event.isSyncing);
        } else {
          _syncingCollection = null;
        }
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _syncingCollection = smartAlbumsService.syncingCollection;
    subscription = Bus.instance.on<SmartAlbumSyncingEvent>().listen(updateData);
  }

  @override
  void dispose() {
    subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = getEnteTextTheme(context);

    return AnimatedCrossFade(
      firstCurve: Curves.easeInOutExpo,
      secondCurve: Curves.easeInOutExpo,
      sizeCurve: Curves.easeInOutExpo,
      crossFadeState:
          !(_syncingCollection == null ||
              _syncingCollection!.$1 != widget.collection?.id)
          ? CrossFadeState.showSecond
          : CrossFadeState.showFirst,
      duration: const Duration(milliseconds: 400),
      secondChild: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ).copyWith(left: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: Colors.black.withValues(alpha: 0.65),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                FadingCircleProgressIndicator(
                  color: _syncingCollection?.$2 ?? true
                      ? const Color(0xFF08C225)
                      : const Color(0xFFF78426),
                ),
                const SizedBox(width: 8),
                Text(
                  (_syncingCollection?.$2 ?? true)
                      ? context.strings.addingPhotos
                      : context.strings.gettingReady,
                  style: textTheme.small.copyWith(color: Colors.white),
                ),
              ],
            ),
          ),
          const SizedBox(height: 50),
        ],
      ),
      firstChild: const SizedBox.shrink(),
    );
  }
}
