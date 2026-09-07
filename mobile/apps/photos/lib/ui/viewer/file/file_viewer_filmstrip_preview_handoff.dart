import "package:flutter/widgets.dart";

/// Keeps the filmstrip preview visible until the committed page has painted.
///
/// Each pending clear is tied to both a generation and the file object so a
/// late callback cannot clear a newer preview after rapid navigation or a list
/// mutation.
class FileViewerFilmstripPreviewHandoff extends ValueNotifier<int?> {
  final void Function(VoidCallback callback) _scheduleAfterNextFramePaint;

  int _generation = 0;
  int? _pendingCommitIndex;
  Object? _pendingFileIdentity;
  bool _isDisposed = false;

  FileViewerFilmstripPreviewHandoff({
    void Function(VoidCallback callback)? scheduleAfterNextFramePaint,
  }) : _scheduleAfterNextFramePaint =
           scheduleAfterNextFramePaint ?? _afterNextFramePaint,
       super(null);

  void showPreview(int index) {
    _invalidatePendingCommit();
    value = index;
  }

  void beginCommit({required int index, required Object fileIdentity}) {
    _generation++;
    _pendingCommitIndex = index;
    _pendingFileIdentity = fileIdentity;
    value = index;
  }

  bool isPendingCommit({required int index, required Object fileIdentity}) =>
      _matchesPendingCommit(index, fileIdentity);

  void onPageChanged({
    required int index,
    required Object fileIdentity,
    required VoidCallback onPagePainted,
  }) {
    if (!_matchesPendingCommit(index, fileIdentity)) return;
    final generation = _generation;
    _scheduleAfterNextFramePaint(() {
      if (_isDisposed ||
          generation != _generation ||
          !_matchesPendingCommit(index, fileIdentity)) {
        return;
      }
      onPagePainted();
    });
  }

  void clear() {
    _invalidatePendingCommit();
    value = null;
  }

  void _invalidatePendingCommit() {
    _generation++;
    _pendingCommitIndex = null;
    _pendingFileIdentity = null;
  }

  bool _matchesPendingCommit(int index, Object fileIdentity) =>
      value == index &&
      _pendingCommitIndex == index &&
      identical(_pendingFileIdentity, fileIdentity);

  @override
  void dispose() {
    _isDisposed = true;
    _invalidatePendingCommit();
    super.dispose();
  }
}

void _afterNextFramePaint(VoidCallback callback) {
  WidgetsBinding.instance.scheduleFrameCallback((_) {
    WidgetsBinding.instance.addPostFrameCallback((_) => callback());
  });
}
