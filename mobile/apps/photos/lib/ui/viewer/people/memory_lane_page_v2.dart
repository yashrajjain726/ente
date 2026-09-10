import "dart:async";
import "dart:math" as math;
import "dart:typed_data";
import "dart:ui";

import "package:collection/collection.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:flutter/services.dart" show SystemUiOverlayStyle;
import "package:hugeicons/hugeicons.dart";
import "package:intl/intl.dart" show DateFormat, NumberFormat;
import "package:logging/logging.dart";
import "package:photos/db/ml/db.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/memory_lane/memory_lane_models.dart";
import "package:photos/models/ml/face/face.dart";
import "package:photos/models/ml/face/person.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/memory_lane/memory_lane_service.dart";
import "package:photos/services/memory_share_service.dart";
import "package:photos/theme/ente_theme.dart";
import "package:photos/ui/viewer/gallery/jump_to_date_gallery.dart";
import "package:photos/ui/viewer/people/memory_lane_page.dart";
import "package:photos/utils/dialog_util.dart";
import "package:photos/utils/face/face_thumbnail_cache.dart";
import "package:photos/utils/share_util.dart";

Future<void> openMemoryLanePage(
  BuildContext context, {
  required String personId,
  required PersonEntity? person,
  bool isCluster = false,
}) async {
  if (!context.mounted || (!isCluster && person == null)) return;

  final Widget page;
  if (flagService.internalUser) {
    page = MemoryLanePageV2(
      personId: personId,
      isCluster: isCluster,
      person: person,
    );
  } else {
    page = MemoryLanePage(
      personId: personId,
      isCluster: isCluster,
      person: person,
    );
  }
  await routeToPage(context, page);
}

class MemoryLanePageV2 extends StatefulWidget {
  final String personId;
  final bool isCluster;
  final PersonEntity? person;

  const MemoryLanePageV2({
    required this.personId,
    required this.isCluster,
    required this.person,
    super.key,
  });

  @override
  State<MemoryLanePageV2> createState() => _MemoryLanePageV2State();
}

class _MemoryLanePageV2State extends State<MemoryLanePageV2> {
  static const _playbackInterval = Duration(milliseconds: 800);

  final _logger = Logger("MemoryLanePageV2");
  Timer? _playbackTimer;
  Object? _playbackToken;
  bool _wasPlayingBeforeSeek = false;
  late final Future<void> _memoryLaneLoaded;
  Key _currentEntryKey = UniqueKey();
  MemoryLanePersonTimeline? _timeline;
  final List<Future<Uint8List?>> _entries = [];
  final Map<(Future<Uint8List?>, Size, bool), Future<(Uint8List, int)?>>
  _decodedEntries = {};
  final List<EnteFile> _files = [];
  int i = 0;

  @override
  void initState() {
    super.initState();
    _memoryLaneLoaded = _loadMemoryLane();
  }

  @override
  void dispose() {
    _playbackTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadMemoryLane() async {
    try {
      final timeline = await MemoryLaneService.instance.getTimeline(
        widget.personId,
        isCluster: widget.isCluster,
      );
      if (!mounted) return;
      _timeline = timeline;
      if (timeline == null ||
          !timeline.isEligible ||
          timeline.entries.isEmpty) {
        return;
      }
      final files = await MemoryLaneService.instance.getTimelineFiles(
        timeline.entries.map((entry) => entry.fileId).toSet(),
      );
      if (!mounted) return;
      Future<Uint8List?> previousEntry = Future.value();
      for (final entry in timeline.entries) {
        final file = files[entry.fileId];
        if (file != null) {
          _files.add(file);
          final entryFuture = previousEntry.then((_) async {
            if (!mounted) return null;
            return _loadEntry(entry, file);
          });
          _entries.add(entryFuture);
          previousEntry = entryFuture;
        }
      }
      if (_entries.isNotEmpty) unawaited(_play(0));
    } catch (error) {
      if (!mounted || ModalRoute.of(context)?.isCurrent != true) return;
      final navigator = Navigator.of(context);
      navigator.pop();
      await showGenericErrorDialog(context: navigator.context, error: error);
    }
  }

  Future<void> _play(int index) async {
    if (_entries.isEmpty) return;
    final token = Object();
    setState(() {
      _playbackTimer?.cancel();
      _selectEntry(index);
      _playbackToken = index < _entries.length - 1 ? token : null;
    });
    if (_playbackToken == null) return;
    await _entries[index];
    if (!mounted || _playbackToken != token) return;
    _playbackTimer = Timer(_playbackInterval, () => _play(index + 1));
  }

  void _pause() {
    setState(() {
      _playbackTimer?.cancel();
      _playbackToken = null;
    });
  }

  void _seekFromPosition(double x, double width) {
    if (width <= 0) return;
    final index = (x / width * _entries.length).floor().clamp(
      0,
      _entries.length - 1,
    );
    setState(() {
      _playbackTimer?.cancel();
      _playbackToken = null;
      _selectEntry(index);
    });
  }

  void _onPlayPauseTap() {
    if (_playbackToken != null) {
      _pause();
    } else if (i == _entries.length - 1) {
      _play(0);
    } else {
      unawaited(_play(i));
    }
  }

  void _onSeekEnd() {
    final wasPlaying = _wasPlayingBeforeSeek;
    _wasPlayingBeforeSeek = false;
    if (wasPlaying) unawaited(_play(i));
  }

  Future<Uint8List?> _loadEntry(MemoryLaneEntry entry, EnteFile file) async {
    try {
      final mlDataDB = isLocalGalleryMode
          ? MLDataDB.localGalleryInstance
          : MLDataDB.instance;
      final List<Face>? faces = await mlDataDB.getFacesForGivenFileID(
        entry.fileId,
      );
      final face = faces?.firstWhereOrNull(
        (face) => face.faceID == entry.faceId,
      );
      if (face == null) return null;
      final crops = await getCachedFaceCrops(file, [face], useTempCache: false);
      final bytes = crops?[entry.faceId];
      if (bytes != null && bytes.isNotEmpty) {
        return bytes;
      }
      return null;
    } catch (e, s) {
      _logger.severe("Failed to load memory lane entry", e, s);
      return null;
    }
  }

  Future<(Uint8List, int)?> _fetchEntry(
    Future<Uint8List?> entry,
    Size targetSize, {
    bool fitWithin = false,
  }) {
    return _decodedEntries.putIfAbsent(
      (entry, targetSize, fitWithin),
      () async {
        final bytes = await entry;
        if (bytes == null || !mounted) return null;
        final buffer = await ImmutableBuffer.fromUint8List(bytes);
        try {
          final descriptor = await ImageDescriptor.encoded(buffer);
          try {
            final scale = (fitWithin ? math.min : math.max)(
              targetSize.width / descriptor.width,
              targetSize.height / descriptor.height,
            );
            final scaledWidth = descriptor.width * scale;
            final decodeWidth =
                (fitWithin ? scaledWidth.floor() : scaledWidth.ceil()).clamp(
                  1,
                  descriptor.width,
                );
            return (bytes, decodeWidth);
          } finally {
            descriptor.dispose();
          }
        } finally {
          buffer.dispose();
        }
      },
    );
  }

  void _selectEntry(int index) {
    if (i != index) _currentEntryKey = UniqueKey();
    i = index;
    if (index != _entries.length - 1) return;
    final entryKey = _currentEntryKey;
    unawaited(
      _entries[index].then((bytes) async {
        if (bytes == null ||
            !mounted ||
            _currentEntryKey != entryKey ||
            ModalRoute.of(context)?.isCurrent != true ||
            localSettings.hasSeenMemoryLane(widget.personId)) {
          return;
        }
        await localSettings.markMemoryLaneSeen(widget.personId);
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.sizeOf(context);
    return FutureBuilder<void>(
      future: _memoryLaneLoaded,
      builder: (context, snapshot) {
        final name = widget.person?.data.name.trim();
        var title = context.strings.facesTimelineAppBarTitle;
        if (name != null && name.isNotEmpty) {
          title = context.strings.memoryLaneCardTitle(
            name: name,
            nameEndsWithS: name.toLowerCase().endsWith("s").toString(),
          );
        }
        final file = _files.isEmpty ? null : _files[i];
        final entry = _entries.isEmpty ? null : _entries[i];
        final creationTime = file?.creationTime;
        final birthDate = DateTime.tryParse(
          widget.person?.data.birthDate ?? "",
        );
        final creationDate = creationTime == null
            ? null
            : DateTime.fromMicrosecondsSinceEpoch(creationTime);
        int? age;
        if (birthDate != null &&
            creationDate != null &&
            !creationDate.isBefore(birthDate)) {
          age = creationDate.year - birthDate.year;
          final lastDay = DateTime(
            creationDate.year,
            birthDate.month + 1,
            0,
          ).day;
          final anniversary = DateTime(
            creationDate.year,
            birthDate.month,
            birthDate.day.clamp(1, lastDay),
          );
          if (creationDate.isBefore(anniversary)) age--;
        }
        const captionPlaceholder = "\uFFFC";
        int? captionValue;
        String? caption;
        if (age != null && name != null && name.isNotEmpty) {
          captionValue = age;
          caption = context.strings.memoryLaneAgeCaption(
            name: name,
            count: age,
            age: captionPlaceholder,
          );
        } else if (creationDate != null) {
          final now = DateTime.now();
          final anniversary = DateTime(
            now.year,
            creationDate.month,
            creationDate.day.clamp(
              1,
              DateTime(now.year, creationDate.month + 1, 0).day,
            ),
          );
          captionValue =
              (now.year -
                      creationDate.year -
                      (now.isBefore(anniversary) ? 1 : 0))
                  .clamp(0, 1000);
          caption = context.strings.facesTimelineCaptionYearsAgo(
            count: captionValue,
          );
          if (caption.contains("#")) {
            caption = caption.replaceAll("#", captionPlaceholder);
          } else {
            caption = caption.replaceFirst(
              NumberFormat.decimalPattern(
                context.strings.localeName,
              ).format(captionValue),
              captionPlaceholder,
            );
          }
          if (name != null && name.isNotEmpty) caption = "$name $caption";
        }
        final captionParts =
            caption?.split(captionPlaceholder) ?? const <String>[];
        return Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                color: Colors.black,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 750),
                  switchInCurve: Curves.easeOutExpo,
                  switchOutCurve: Curves.easeInExpo,
                  child: FutureBuilder<(Uint8List, int)?>(
                    key: _currentEntryKey,
                    future: entry == null
                        ? null
                        : _fetchEntry(
                            entry,
                            const Size.square(256),
                            fitWithin: true,
                          ),
                    builder: (context, entrySnapshot) {
                      final crop = entrySnapshot.data;
                      if (crop == null) return const SizedBox.expand();
                      return ImageFiltered(
                        imageFilter: ImageFilter.blur(sigmaX: 100, sigmaY: 100),
                        child: Image.memory(
                          crop.$1,
                          cacheWidth: crop.$2,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          height: double.infinity,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            Scaffold(
              backgroundColor: Colors.transparent,
              appBar: AppBar(
                backgroundColor: Colors.transparent,
                foregroundColor: Colors.white,
                iconTheme: const IconThemeData(color: Colors.white),
                actionsIconTheme: const IconThemeData(color: Colors.white),
                systemOverlayStyle: SystemUiOverlayStyle.light,
                title: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Hero(
                      tag: 'memory-lane-title-${widget.personId}',
                      child: Text(
                        title,
                        style: darkTheme.textTheme.large.copyWith(
                          inherit: false,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (file != null && creationTime != null)
                      GestureDetector(
                        onTap: () => _onDateTap(file),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              DateFormat.yMMMMd(
                                Localizations.localeOf(context).toLanguageTag(),
                              ).format(
                                DateTime.fromMicrosecondsSinceEpoch(
                                  creationTime,
                                ),
                              ),
                              style: darkTheme.textTheme.small,
                            ),
                            const Icon(
                              Icons.chevron_right,
                              size: 16,
                              color: Colors.white,
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                leadingWidth: 48 + screenSize.width * 0.04,
                actionsPadding: EdgeInsets.only(right: screenSize.width * 0.04),
                // TODO: Replace with an Ente component when it supports this pressed overlay.
                leading: Align(
                  alignment: Alignment.centerRight,
                  child: SizedBox.square(
                    dimension: 48,
                    child: IconButton(
                      tooltip: context.strings.close,
                      style: IconButton.styleFrom(
                        overlayColor: Colors.white.withValues(alpha: 0.08),
                      ),
                      icon: const HugeIcon(
                        icon: HugeIcons.strokeRoundedCancel01,
                        color: Colors.white,
                      ),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ),
                ),
                actions: [
                  if (widget.person != null &&
                      flagService.enableMemoryShareLink &&
                      !isLocalGalleryMode)
                    // TODO: Replace with an Ente component when it supports this pressed overlay.
                    SizedBox.square(
                      dimension: 48,
                      child: IconButton(
                        tooltip: context.strings.shareLink,
                        style: IconButton.styleFrom(
                          overlayColor: Colors.white.withValues(alpha: 0.08),
                        ),
                        icon: const HugeIcon(
                          icon: HugeIcons.strokeRoundedShare08,
                          color: Colors.white,
                        ),
                        onPressed: _onShareTap,
                      ),
                    ),
                ],
              ),
              body: Column(
                children: [
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: screenSize.width * 0.08,
                        vertical: screenSize.height * 0.04,
                      ),
                      child: Align(
                        child: AspectRatio(
                          aspectRatio: 3 / 4,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(24),
                            child: AnimatedSwitcher(
                              duration: const Duration(milliseconds: 1000),
                              switchInCurve: Curves.easeOutCubic,
                              switchOutCurve: Curves.easeInCubic,
                              transitionBuilder: (child, animation) {
                                return AnimatedBuilder(
                                  animation: animation,
                                  child: FadeTransition(
                                    opacity: animation,
                                    child: ScaleTransition(
                                      scale: Tween<double>(
                                        begin: 1,
                                        end: 1.1,
                                      ).animate(animation),
                                      child: child,
                                    ),
                                  ),
                                  builder: (context, child) {
                                    final blur = 12 * (1 - animation.value);
                                    return ImageFiltered(
                                      imageFilter: ImageFilter.blur(
                                        sigmaX: blur,
                                        sigmaY: blur,
                                      ),
                                      child: child,
                                    );
                                  },
                                );
                              },
                              child: switch (snapshot.connectionState) {
                                ConnectionState.done when file != null =>
                                  LayoutBuilder(
                                    key: _currentEntryKey,
                                    builder: (context, constraints) =>
                                        FutureBuilder<(Uint8List, int)?>(
                                          future: entry == null
                                              ? null
                                              : _fetchEntry(
                                                  entry,
                                                  constraints.biggest *
                                                      MediaQuery.devicePixelRatioOf(
                                                        context,
                                                      ) *
                                                      1.1,
                                                ),
                                          builder: (context, entrySnapshot) {
                                            final crop = entrySnapshot.data;
                                            if (crop == null) {
                                              if (entrySnapshot
                                                      .connectionState ==
                                                  ConnectionState.done) {
                                                return Center(
                                                  child: Text(
                                                    context
                                                        .strings
                                                        .facesTimelineUnavailable,
                                                    style: darkTheme
                                                        .textTheme
                                                        .small,
                                                  ),
                                                );
                                              }
                                              return const Center(
                                                child:
                                                    CircularProgressIndicator(
                                                      color: Colors.white,
                                                    ),
                                              );
                                            }
                                            return Image.memory(
                                              crop.$1,
                                              cacheWidth: crop.$2,
                                              fit: BoxFit.cover,
                                              width: double.infinity,
                                              height: double.infinity,
                                            );
                                          },
                                        ),
                                  ),
                                ConnectionState.done => Center(
                                  key: const ValueKey("memory-lane-empty"),
                                  child: Text(
                                    context.strings.facesTimelineUnavailable,
                                    style: darkTheme.textTheme.small,
                                  ),
                                ),
                                _ => const Center(
                                  key: ValueKey("memory-lane-loading"),
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                  ),
                                ),
                              },
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: screenSize.height * 0.2,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        if (captionValue != null) ...[
                          ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 48),
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                spacing: screenSize.width * 0.02,
                                children: [
                                  for (
                                    var index = 0;
                                    index < captionParts.length;
                                    index++
                                  ) ...[
                                    if (index > 0)
                                      _MemoryLaneAnimatedDigit(
                                        value: captionValue,
                                      ),
                                    Flexible(
                                      child: Text(
                                        captionParts[index],
                                        style: darkTheme.textTheme.bodyMuted,
                                        textAlign: TextAlign.center,
                                        softWrap: false,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          SizedBox(height: screenSize.height * 0.02),
                        ],
                        if (_entries.isNotEmpty)
                          ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 48),
                            child: Padding(
                              padding: EdgeInsets.symmetric(
                                horizontal: screenSize.width * 0.16,
                              ),
                              child: Row(
                                mainAxisAlignment: .center,
                                children: [
                                  // TODO: Replace with an Ente component.
                                  IconButton(
                                    style: ButtonStyle(
                                      fixedSize: const WidgetStatePropertyAll(
                                        Size.square(48),
                                      ),
                                      shape: const WidgetStatePropertyAll(
                                        CircleBorder(),
                                      ),
                                      foregroundColor:
                                          const WidgetStatePropertyAll(
                                            Colors.white,
                                          ),
                                      overlayColor:
                                          const WidgetStatePropertyAll(
                                            Colors.transparent,
                                          ),
                                      backgroundColor:
                                          WidgetStateProperty.resolveWith(
                                            (states) => Colors.white.withValues(
                                              alpha:
                                                  states.contains(
                                                    WidgetState.disabled,
                                                  )
                                                  ? 0.16
                                                  : states.contains(
                                                      WidgetState.pressed,
                                                    )
                                                  ? 0.36
                                                  : states.contains(
                                                      WidgetState.hovered,
                                                    )
                                                  ? 0.30
                                                  : 0.24,
                                            ),
                                          ),
                                    ),
                                    tooltip: _playbackToken != null
                                        ? context
                                              .strings
                                              .facesTimelinePlaybackPause
                                        : context
                                              .strings
                                              .facesTimelinePlaybackPlay,
                                    onPressed: _onPlayPauseTap,
                                    icon: HugeIcon(
                                      icon: _playbackToken != null
                                          ? HugeIcons.strokeRoundedPause
                                          : HugeIcons.strokeRoundedPlay,
                                      size: 18,
                                      color: Colors.white,
                                    ),
                                  ),
                                  SizedBox(width: screenSize.width * 0.03),
                                  Expanded(
                                    child: LayoutBuilder(
                                      builder: (context, constraints) {
                                        const maxDotSize = 15.0;
                                        const dotSpacing = 5.0;
                                        final dotCount =
                                            ((constraints.maxWidth +
                                                        dotSpacing) /
                                                    (maxDotSize + dotSpacing))
                                                .floor()
                                                .clamp(1, _entries.length);
                                        final activeDot =
                                            i * dotCount ~/ _entries.length;
                                        return GestureDetector(
                                          behavior: HitTestBehavior.opaque,
                                          onHorizontalDragDown: (_) {
                                            _wasPlayingBeforeSeek =
                                                _playbackToken != null;
                                          },
                                          onTapDown: (details) =>
                                              _seekFromPosition(
                                                details.localPosition.dx,
                                                constraints.maxWidth,
                                              ),
                                          onTapUp: (_) => _onSeekEnd(),
                                          onHorizontalDragStart: (details) =>
                                              _seekFromPosition(
                                                details.localPosition.dx,
                                                constraints.maxWidth,
                                              ),
                                          onHorizontalDragUpdate: (details) =>
                                              _seekFromPosition(
                                                details.localPosition.dx,
                                                constraints.maxWidth,
                                              ),
                                          onHorizontalDragEnd: (_) =>
                                              _onSeekEnd(),
                                          child: Row(
                                            spacing: dotSpacing,
                                            children: List.generate(dotCount, (
                                              index,
                                            ) {
                                              final distance =
                                                  (index - activeDot).abs();
                                              final double size =
                                                  switch (distance) {
                                                    0 => maxDotSize,
                                                    1 => 10,
                                                    2 => 7.5,
                                                    _ => 5,
                                                  };
                                              return Expanded(
                                                child: SizedBox(
                                                  height: 40,
                                                  child: Center(
                                                    child: AnimatedContainer(
                                                      duration: const Duration(
                                                        milliseconds: 200,
                                                      ),
                                                      width: size,
                                                      height: size,
                                                      decoration: BoxDecoration(
                                                        shape: BoxShape.circle,
                                                        color: Colors.white
                                                            .withValues(
                                                              alpha:
                                                                  distance == 0
                                                                  ? 1
                                                                  : 0.5,
                                                            ),
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              );
                                            }),
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        SizedBox(height: screenSize.height * 0.055),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _onShareTap() async {
    final timeline = _timeline;
    final person = widget.person;
    if (!flagService.enableMemoryShareLink ||
        isLocalGalleryMode ||
        timeline == null ||
        person == null ||
        !timeline.isEligible ||
        timeline.entries.isEmpty) {
      return;
    }
    final l10n = context.strings;
    final name = person.data.name.trim();
    var title = l10n.facesTimelineAppBarTitle;
    if (name.isNotEmpty) {
      title = l10n.memoryLaneCardTitle(
        name: name,
        nameEndsWithS: name.toLowerCase().endsWith("s").toString(),
      );
    }
    final dialog = createProgressDialog(context, l10n.creatingLink);
    final wasPlaying = _playbackToken != null;
    _pause();

    try {
      await dialog.show();
      final shareLinkData = await MemoryShareService.instance
          .getOrCreateMemoryLaneLink(
            entries: timeline.entries,
            title: title,
            personId: person.remoteID,
            personName: person.data.name,
            birthDate: person.data.birthDate,
          );
      await dialog.hide();
      if (!mounted) return;
      await shareText(
        formatMemoryShareText(title, shareLinkData.$1),
        context: context,
      );
    } catch (e) {
      await dialog.hide();
      if (!mounted) return;
      await showGenericErrorBottomSheet(context: context, error: e);
    } finally {
      if (mounted && wasPlaying && ModalRoute.of(context)?.isCurrent == true) {
        unawaited(_play(i));
      }
    }
  }

  Future<void> _onDateTap(EnteFile file) async {
    final wasPlaying = _playbackToken != null;
    _pause();
    try {
      await routeToPage(context, JumpToDateGallery(fileToJumpTo: file));
    } finally {
      if (mounted && wasPlaying && ModalRoute.of(context)?.isCurrent == true) {
        unawaited(_play(i));
      }
    }
  }
}

class _MemoryLaneAnimatedDigit extends StatefulWidget {
  const _MemoryLaneAnimatedDigit({required this.value}) : assert(value >= 0);

  final int value;

  @override
  State<_MemoryLaneAnimatedDigit> createState() =>
      _MemoryLaneAnimatedDigitState();
}

class _MemoryLaneAnimatedDigitState extends State<_MemoryLaneAnimatedDigit>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late int _previousValue;

  @override
  void initState() {
    super.initState();
    _previousValue = widget.value;
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
      value: 1,
    );
  }

  @override
  void didUpdateWidget(_MemoryLaneAnimatedDigit oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value) {
      _previousValue = oldWidget.value;
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final direction = widget.value >= _previousValue ? 1 : -1;
    final formatter = NumberFormat.decimalPattern(context.strings.localeName);
    final current = formatter.format(widget.value);
    final previous = formatter.format(_previousValue);
    final disableAnimations =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Semantics(
      label: current,
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final progress = disableAnimations
              ? 1.0
              : Curves.easeOutCubic.transform(_controller.value);
          final length = progress == 1
              ? current.length
              : math.max(current.length, previous.length);
          return Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            textDirection: TextDirection.ltr,
            children: [
              for (var place = length - 1; place >= 0; place--)
                Builder(
                  key: ValueKey(place),
                  builder: (context) {
                    final nextDigit = place < current.length
                        ? current[current.length - place - 1]
                        : null;
                    final oldDigit = place < previous.length
                        ? previous[previous.length - place - 1]
                        : null;
                    if (progress == 1 || oldDigit == nextDigit) {
                      return Text(
                        nextDigit ?? "",
                        style: darkTheme.textTheme.h2Bold,
                      );
                    }
                    return ClipRect(
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          if (oldDigit != null)
                            FractionalTranslation(
                              translation: Offset(0, -direction * progress),
                              child: Text(
                                oldDigit,
                                style: darkTheme.textTheme.h2Bold,
                              ),
                            ),
                          if (nextDigit != null)
                            FractionalTranslation(
                              translation: Offset(
                                0,
                                direction * (1 - progress),
                              ),
                              child: Text(
                                nextDigit,
                                style: darkTheme.textTheme.h2Bold,
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
            ],
          );
        },
      ),
    );
  }
}
