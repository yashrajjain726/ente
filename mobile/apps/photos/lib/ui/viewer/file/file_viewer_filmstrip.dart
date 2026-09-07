import "dart:async";
import "dart:math";

import "package:flutter/material.dart";
import "package:flutter/services.dart";

const fileViewerFilmstripKey = ValueKey<String>("file-viewer-filmstrip");
const fileViewerFilmstripListKey = ValueKey<String>(
  "file-viewer-filmstrip-list",
);
const fileViewerFilmstripPreviewKey = ValueKey<String>(
  "file-viewer-filmstrip-preview",
);

const kFileViewerFilmstripHeight = 45.0;
const kFileViewerFilmstripGap = 6.0;
const kFileViewerFilmstripAdditionalBottomInset =
    kFileViewerFilmstripHeight + kFileViewerFilmstripGap + 6.0;

const _itemExtent = 33.0;
const _selectedThumbnailSize = Size(34, 43);
const _thumbnailSize = Size(29, 35);
const _thumbnailBorderRadius = BorderRadius.all(Radius.circular(2.5));
const _cacheExtentInItems = 4;
const _scrollAnimationDuration = Duration(milliseconds: 180);
const _maxFlingVelocity = 800.0;
// Evaluating a slightly faster platform simulation on a slower clock keeps the
// launch velocity unchanged while extending its distance and settling time.
const _ballisticTimeScale = 0.7;

enum FileViewerFilmstripSelectionSource {
  tap,
  scrubStart,
  scrubPreview,
  scrubCommit,
}

enum _AlignmentState { idle, scheduled, deferred }

typedef FileViewerFilmstripSelectionCallback =
    void Function(int index, FileViewerFilmstripSelectionSource source);
typedef FileViewerFilmstripSemanticValueBuilder =
    String Function(int current, int total);

class FileViewerFilmstrip extends StatefulWidget {
  final int itemCount;
  final int selectedIndex;
  final IndexedWidgetBuilder itemBuilder;
  final Key? Function(int index)? itemKeyBuilder;
  final int? Function(Key key)? findChildIndexCallback;
  final FileViewerFilmstripSelectionCallback onSelectionChanged;
  final String? semanticLabel;
  final FileViewerFilmstripSemanticValueBuilder semanticValueBuilder;

  const FileViewerFilmstrip({
    required this.itemCount,
    required this.selectedIndex,
    required this.itemBuilder,
    required this.onSelectionChanged,
    required this.semanticValueBuilder,
    this.itemKeyBuilder,
    this.findChildIndexCallback,
    this.semanticLabel,
    super.key = fileViewerFilmstripKey,
  }) : assert(itemCount >= 0);

  @override
  State<FileViewerFilmstrip> createState() => _FileViewerFilmstripState();
}

class _FileViewerFilmstripState extends State<FileViewerFilmstrip> {
  late final ScrollController _scrollController;
  late final ValueNotifier<int> _focusedIndexNotifier;
  final Set<int> _activePointerIds = {};
  bool _isScrubbing = false;
  _AlignmentState _alignmentState = _AlignmentState.idle;

  int get _focusedIndex => _focusedIndexNotifier.value;

  bool get _isInteracting => _isScrubbing || _activePointerIds.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _focusedIndexNotifier = ValueNotifier(_clampIndex(widget.selectedIndex));
    _scrollController = ScrollController(
      initialScrollOffset: _offsetForIndex(_focusedIndex),
    );
    _scrollController.addListener(_onScrollOffsetChanged);
  }

  @override
  void didUpdateWidget(covariant FileViewerFilmstrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    final selectedIndex = _clampIndex(widget.selectedIndex);
    final itemCountChanged = widget.itemCount != oldWidget.itemCount;
    final shouldSyncFocus = !_isScrubbing || _focusedIndex >= widget.itemCount;
    final focusChanged = shouldSyncFocus && _focusedIndex != selectedIndex;
    if (focusChanged) {
      _focusedIndexNotifier.value = selectedIndex;
    }

    if (!_isScrubbing && (focusChanged || itemCountChanged)) {
      _scheduleCentering();
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScrollOffsetChanged);
    _scrollController.dispose();
    _focusedIndexNotifier.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.itemCount == 0) {
      return const SizedBox.shrink();
    }

    return ValueListenableBuilder<int>(
      valueListenable: _focusedIndexNotifier,
      child: ExcludeSemantics(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontalPadding = max(
              0.0,
              (constraints.maxWidth - _itemExtent) / 2,
            );
            return Listener(
              onPointerDown: (event) => _activePointerIds.add(event.pointer),
              onPointerUp: _onPointerReleased,
              onPointerCancel: _onPointerReleased,
              child: NotificationListener<ScrollNotification>(
                onNotification: _onScrollNotification,
                child: SizedBox(
                  height: kFileViewerFilmstripHeight,
                  child: ListView.builder(
                    key: fileViewerFilmstripListKey,
                    controller: _scrollController,
                    clipBehavior: Clip.none,
                    scrollDirection: Axis.horizontal,
                    physics: const _FilmstripScrollPhysics(),
                    itemCount: widget.itemCount,
                    itemExtent: _itemExtent,
                    findChildIndexCallback: widget.findChildIndexCallback,
                    padding: EdgeInsets.symmetric(
                      horizontal: horizontalPadding,
                    ),
                    cacheExtent: _itemExtent * _cacheExtentInItems,
                    addAutomaticKeepAlives: false,
                    addSemanticIndexes: false,
                    itemBuilder: (context, index) => _buildItem(context, index),
                  ),
                ),
              ),
            );
          },
        ),
      ),
      builder: (context, focusedIndex, child) {
        final selectedIndex = _clampIndex(focusedIndex);
        return Semantics(
          container: true,
          label: widget.semanticLabel,
          value: widget.semanticValueBuilder(
            selectedIndex + 1,
            widget.itemCount,
          ),
          increasedValue: selectedIndex < widget.itemCount - 1
              ? widget.semanticValueBuilder(selectedIndex + 2, widget.itemCount)
              : null,
          decreasedValue: selectedIndex > 0
              ? widget.semanticValueBuilder(selectedIndex, widget.itemCount)
              : null,
          onIncrease: selectedIndex < widget.itemCount - 1
              ? () => _select(
                  selectedIndex + 1,
                  FileViewerFilmstripSelectionSource.tap,
                )
              : null,
          onDecrease: selectedIndex > 0
              ? () => _select(
                  selectedIndex - 1,
                  FileViewerFilmstripSelectionSource.tap,
                )
              : null,
          child: child,
        );
      },
    );
  }

  Widget _buildItem(BuildContext context, int index) {
    final item = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _select(index, FileViewerFilmstripSelectionSource.tap),
      child: SizedBox(
        width: _itemExtent,
        height: kFileViewerFilmstripHeight,
        child: OverflowBox(
          minWidth: 0,
          maxWidth: _selectedThumbnailSize.width,
          minHeight: 0,
          maxHeight: _selectedThumbnailSize.height,
          child: AnimatedBuilder(
            animation: _scrollController,
            child: widget.itemBuilder(context, index),
            builder: (context, thumbnail) {
              final proximity = _centerProximity(index);
              final size = Size.lerp(
                _thumbnailSize,
                _selectedThumbnailSize,
                proximity,
              )!;
              return SizedBox.fromSize(
                size: size,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: _thumbnailBorderRadius,
                    boxShadow: [
                      BoxShadow(
                        color: Color.lerp(
                          const Color(0x24000000),
                          const Color(0x33000000),
                          proximity,
                        )!,
                        blurRadius: 2 + proximity,
                        offset: const Offset(0, 1),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: _thumbnailBorderRadius,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        thumbnail!,
                        ColoredBox(
                          color: Color.lerp(
                            Colors.black26,
                            Colors.transparent,
                            proximity,
                          )!,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
    final key = widget.itemKeyBuilder?.call(index);
    return key == null ? item : KeyedSubtree(key: key, child: item);
  }

  bool _onScrollNotification(ScrollNotification notification) {
    if (notification is ScrollStartNotification &&
        notification.dragDetails != null) {
      _isScrubbing = true;
      widget.onSelectionChanged(
        _focusedIndex,
        FileViewerFilmstripSelectionSource.scrubStart,
      );
    }

    if (notification is ScrollEndNotification) {
      if (_isScrubbing) {
        final finalIndex = _syncFocusToScrollPosition();
        _isScrubbing = false;
        widget.onSelectionChanged(
          finalIndex,
          FileViewerFilmstripSelectionSource.scrubCommit,
        );
      }
      _scheduleCentering();
    }
    return false;
  }

  int _syncFocusToScrollPosition() {
    final index = _nearestScrolledIndex();
    if (index != _focusedIndex) {
      _select(
        index,
        FileViewerFilmstripSelectionSource.scrubPreview,
        center: false,
      );
    }
    return index;
  }

  void _onScrollOffsetChanged() {
    if (_isScrubbing) _syncFocusToScrollPosition();
  }

  void _onPointerReleased(PointerEvent event) {
    _activePointerIds.remove(event.pointer);
    if (_activePointerIds.isEmpty &&
        !_isScrubbing &&
        _alignmentState == _AlignmentState.deferred) {
      _scheduleCentering();
    }
  }

  int _nearestScrolledIndex() {
    if (!_scrollController.hasClients || widget.itemCount == 0) return 0;
    return _clampIndex((_scrollController.offset / _itemExtent).round());
  }

  void _select(
    int index,
    FileViewerFilmstripSelectionSource source, {
    bool center = true,
  }) {
    final clampedIndex = _clampIndex(index);
    final focusChanged = clampedIndex != _focusedIndex;
    final shouldNotify =
        focusChanged || clampedIndex != _clampIndex(widget.selectedIndex);
    if (focusChanged) {
      _focusedIndexNotifier.value = clampedIndex;
    }
    if (shouldNotify) {
      unawaited(HapticFeedback.selectionClick());
      widget.onSelectionChanged(clampedIndex, source);
    }
    if (center) _animateToIndex(clampedIndex);
  }

  double _centerProximity(int index) {
    var scrollOffset = _offsetForIndex(_focusedIndex);
    if (_scrollController.hasClients) {
      final position = _scrollController.position;
      scrollOffset = position.hasContentDimensions
          ? position.pixels
                .clamp(position.minScrollExtent, position.maxScrollExtent)
                .toDouble()
          : position.pixels;
    }
    final linearProximity =
        (1 - ((scrollOffset - _offsetForIndex(index)).abs() / _itemExtent))
            .clamp(0.0, 1.0)
            .toDouble();
    return linearProximity * linearProximity * (3 - (2 * linearProximity));
  }

  void _scheduleCentering() {
    if (widget.itemCount == 0 || _alignmentState == _AlignmentState.scheduled) {
      return;
    }
    _alignmentState = _AlignmentState.scheduled;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_isInteracting) {
        _alignmentState = _AlignmentState.deferred;
        return;
      }
      _alignmentState = _AlignmentState.idle;
      _animateToIndex(_focusedIndex);
    });
  }

  void _animateToIndex(int index) {
    if (widget.itemCount == 0 || !_scrollController.hasClients) return;
    final position = _scrollController.position;
    final target = _offsetForIndex(
      _clampIndex(index),
    ).clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((position.pixels - target).abs() < 0.5) return;
    unawaited(
      _scrollController.animateTo(
        target,
        duration: _scrollAnimationDuration,
        curve: Curves.easeOutCubic,
      ),
    );
  }

  int _clampIndex(int index) {
    if (widget.itemCount == 0) return 0;
    return index.clamp(0, widget.itemCount - 1);
  }

  double _offsetForIndex(int index) => index * _itemExtent;
}

class _FilmstripScrollPhysics extends ScrollPhysics {
  const _FilmstripScrollPhysics({super.parent});

  @override
  _FilmstripScrollPhysics applyTo(ScrollPhysics? ancestor) =>
      _FilmstripScrollPhysics(parent: buildParent(ancestor));

  @override
  double get maxFlingVelocity => _maxFlingVelocity;

  @override
  double carriedMomentum(double existingVelocity) {
    final momentum = const BouncingScrollPhysics().carriedMomentum(
      existingVelocity,
    );
    return momentum.clamp(-_maxFlingVelocity, _maxFlingVelocity).toDouble();
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    final cappedVelocity = velocity
        .clamp(-_maxFlingVelocity, _maxFlingVelocity)
        .toDouble();
    if (position.outOfRange ||
        cappedVelocity.abs() < toleranceFor(position).velocity) {
      return super.createBallisticSimulation(position, cappedVelocity);
    }
    final simulation = super.createBallisticSimulation(
      position,
      cappedVelocity / _ballisticTimeScale,
    );
    return simulation == null
        ? null
        : _FilmstripBallisticSimulation(
            simulation,
            timeScale: _ballisticTimeScale,
          );
  }
}

class _FilmstripBallisticSimulation extends Simulation {
  final Simulation _simulation;
  final double _timeScale;

  _FilmstripBallisticSimulation(this._simulation, {required double timeScale})
    : assert(timeScale > 0 && timeScale <= 1),
      _timeScale = timeScale,
      super(tolerance: _simulation.tolerance);

  @override
  double x(double time) => _simulation.x(time * _timeScale);

  @override
  double dx(double time) => _simulation.dx(time * _timeScale) * _timeScale;

  @override
  bool isDone(double time) => _simulation.isDone(time * _timeScale);
}
