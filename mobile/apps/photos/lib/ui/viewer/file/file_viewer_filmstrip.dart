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
const _selectedThumbnailWidth = 34.0;
const _selectedThumbnailHeight = 43.0;
const _thumbnailWidth = 29.0;
const _thumbnailHeight = 35.0;
const _cacheExtentInItems = 4;
const _selectionAnimationDuration = Duration(milliseconds: 120);
const _scrollAnimationDuration = Duration(milliseconds: 180);
const _scrubThrottleDuration = Duration(milliseconds: 50);

enum FileViewerFilmstripSelectionSource {
  tap,
  scrubStart,
  scrubPreview,
  scrubCommit,
}

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
  late int _visualSelectedIndex;
  bool _isUserScrollSession = false;
  bool _alignmentScheduled = false;
  Timer? _scrubThrottleTimer;
  int? _pendingScrubIndex;

  @override
  void initState() {
    super.initState();
    _visualSelectedIndex = _clampIndex(widget.selectedIndex);
    _scrollController = ScrollController(
      initialScrollOffset: _offsetForIndex(_visualSelectedIndex),
    );
  }

  @override
  void didUpdateWidget(covariant FileViewerFilmstrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    final selectedIndex = _clampIndex(widget.selectedIndex);
    if (!_isUserScrollSession) {
      _visualSelectedIndex = selectedIndex;
    } else if (_visualSelectedIndex >= widget.itemCount) {
      _visualSelectedIndex = selectedIndex;
    }

    if (!_isUserScrollSession &&
        (selectedIndex != _clampIndex(oldWidget.selectedIndex) ||
            widget.itemCount != oldWidget.itemCount)) {
      _scheduleAlignment(selectedIndex, animate: true);
    }
  }

  @override
  void dispose() {
    _scrubThrottleTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.itemCount == 0) {
      return const SizedBox.shrink();
    }

    final selectedIndex = _clampIndex(_visualSelectedIndex);
    return Semantics(
      container: true,
      label: widget.semanticLabel,
      value: widget.semanticValueBuilder(selectedIndex + 1, widget.itemCount),
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
      child: ExcludeSemantics(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontalPadding = max(
              0.0,
              (constraints.maxWidth - _itemExtent) / 2,
            );
            return NotificationListener<ScrollNotification>(
              onNotification: _onScrollNotification,
              child: SizedBox(
                height: kFileViewerFilmstripHeight,
                child: ListView.builder(
                  key: fileViewerFilmstripListKey,
                  controller: _scrollController,
                  clipBehavior: Clip.none,
                  scrollDirection: Axis.horizontal,
                  itemCount: widget.itemCount,
                  itemExtent: _itemExtent,
                  findChildIndexCallback: widget.findChildIndexCallback,
                  padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
                  cacheExtent: _itemExtent * _cacheExtentInItems,
                  addAutomaticKeepAlives: false,
                  addSemanticIndexes: false,
                  itemBuilder: (context, index) => _buildItem(context, index),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildItem(BuildContext context, int index) {
    final isSelected = index == _visualSelectedIndex;
    final item = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _select(index, FileViewerFilmstripSelectionSource.tap),
      child: SizedBox(
        width: _itemExtent,
        height: kFileViewerFilmstripHeight,
        child: OverflowBox(
          minWidth: 0,
          maxWidth: _selectedThumbnailWidth,
          minHeight: 0,
          maxHeight: _selectedThumbnailHeight,
          child: AnimatedContainer(
            duration: _selectionAnimationDuration,
            curve: Curves.easeOutCubic,
            width: isSelected ? _selectedThumbnailWidth : _thumbnailWidth,
            height: isSelected ? _selectedThumbnailHeight : _thumbnailHeight,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2.5),
              boxShadow: [
                BoxShadow(
                  color: isSelected
                      ? const Color(0x33000000)
                      : const Color(0x24000000),
                  blurRadius: isSelected ? 3 : 2,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2.5),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  widget.itemBuilder(context, index),
                  AnimatedContainer(
                    duration: _selectionAnimationDuration,
                    color: isSelected ? Colors.transparent : Colors.black26,
                  ),
                ],
              ),
            ),
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
      _isUserScrollSession = true;
      _pendingScrubIndex = null;
      widget.onSelectionChanged(
        _visualSelectedIndex,
        FileViewerFilmstripSelectionSource.scrubStart,
      );
    }

    if (_isUserScrollSession &&
        (notification is ScrollUpdateNotification ||
            notification is OverscrollNotification)) {
      _queueNearestScrolledItem();
    }

    if (notification is ScrollEndNotification && _isUserScrollSession) {
      _scrubThrottleTimer?.cancel();
      _scrubThrottleTimer = null;
      _pendingScrubIndex = null;
      final finalIndex = _nearestScrolledIndex();
      if (finalIndex != _visualSelectedIndex) {
        unawaited(HapticFeedback.selectionClick());
        _select(
          finalIndex,
          FileViewerFilmstripSelectionSource.scrubPreview,
          align: false,
          notifySelection: false,
          triggerHaptic: false,
        );
      }
      _isUserScrollSession = false;
      widget.onSelectionChanged(
        finalIndex,
        FileViewerFilmstripSelectionSource.scrubCommit,
      );
      _scheduleAlignment(_visualSelectedIndex, animate: true);
    }
    return false;
  }

  void _queueNearestScrolledItem() {
    final index = _nearestScrolledIndex();
    if (index == _visualSelectedIndex) {
      _pendingScrubIndex = null;
      return;
    }
    if (index == _pendingScrubIndex) return;
    _pendingScrubIndex = index;
    if (_scrubThrottleTimer != null) return;
    _flushPendingScrubSelection();
    _startScrubThrottleWindow();
  }

  void _startScrubThrottleWindow() {
    _scrubThrottleTimer = Timer(_scrubThrottleDuration, () {
      _scrubThrottleTimer = null;
      if (!mounted || _pendingScrubIndex == null) return;
      _flushPendingScrubSelection();
      if (_isUserScrollSession) _startScrubThrottleWindow();
    });
  }

  void _flushPendingScrubSelection() {
    final index = _pendingScrubIndex;
    _pendingScrubIndex = null;
    if (index == null) return;
    _select(
      index,
      FileViewerFilmstripSelectionSource.scrubPreview,
      align: false,
    );
  }

  int _nearestScrolledIndex() {
    if (!_scrollController.hasClients || widget.itemCount == 0) return 0;
    return _clampIndex((_scrollController.offset / _itemExtent).round());
  }

  void _select(
    int index,
    FileViewerFilmstripSelectionSource source, {
    bool align = true,
    bool notifySelection = true,
    bool triggerHaptic = true,
  }) {
    final clampedIndex = _clampIndex(index);
    if (clampedIndex == _visualSelectedIndex) {
      if (notifySelection &&
          clampedIndex != _clampIndex(widget.selectedIndex)) {
        if (triggerHaptic) unawaited(HapticFeedback.selectionClick());
        widget.onSelectionChanged(clampedIndex, source);
      }
      if (align) _alignToIndex(clampedIndex, animate: true);
      return;
    }
    setState(() => _visualSelectedIndex = clampedIndex);
    if (notifySelection) {
      if (triggerHaptic) unawaited(HapticFeedback.selectionClick());
      widget.onSelectionChanged(clampedIndex, source);
    }
    if (align) _alignToIndex(clampedIndex, animate: true);
  }

  void _scheduleAlignment(int index, {required bool animate}) {
    if (widget.itemCount == 0 || _alignmentScheduled) return;
    _alignmentScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _alignmentScheduled = false;
      if (mounted) _alignToIndex(index, animate: animate);
    });
  }

  void _alignToIndex(int index, {required bool animate}) {
    if (widget.itemCount == 0 || !_scrollController.hasClients) return;
    final position = _scrollController.position;
    final target = _offsetForIndex(
      _clampIndex(index),
    ).clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((position.pixels - target).abs() < 0.5) return;
    if (animate) {
      unawaited(
        _scrollController.animateTo(
          target,
          duration: _scrollAnimationDuration,
          curve: Curves.easeOutCubic,
        ),
      );
    } else {
      _scrollController.jumpTo(target);
    }
  }

  int _clampIndex(int index) {
    if (widget.itemCount == 0) return 0;
    return index.clamp(0, widget.itemCount - 1);
  }

  double _offsetForIndex(int index) => index * _itemExtent;
}
