import "package:flutter/foundation.dart";
import "package:flutter/widgets.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_event.dart";

/// Returns the viewer's currently committed page index.
typedef FileViewerFilmstripCurrentIndex = int Function();

/// Returns the stable identity currently stored at [index], or null if absent.
typedef FileViewerFilmstripIdentityAt = Object? Function(int index);

/// Requests an animation-free page jump and reports whether it was dispatched.
typedef FileViewerFilmstripImmediatePageJump = bool Function(int index);

/// Runs [callback] after a guaranteed future frame's paint phase.
typedef FileViewerFilmstripPaintScheduler =
    void Function(VoidCallback callback);

/// Coordinates the filmstrip's interaction lifecycle with the full-page
/// viewer without depending on media, navigation, or application services.
///
/// A user scroll session starts with the drag and remains active through any
/// ballistic coast. During that session, [previewIndex] exposes the centered
/// thumbnail when it differs from the committed page. On commit, the preview
/// stays visible until the destination page has had a guaranteed future paint
/// opportunity.
class FileViewerFilmstripCoordinator {
  final FileViewerFilmstripCurrentIndex _currentIndex;
  final FileViewerFilmstripIdentityAt _identityAt;
  final FileViewerFilmstripImmediatePageJump _jumpToPageImmediately;
  final VoidCallback _requestPauseCurrentMedia;
  final FileViewerFilmstripPaintScheduler _scheduleAfterNextFramePaint;

  final ValueNotifier<int?> _previewIndexNotifier = ValueNotifier(null);

  // The session is the source of truth; previewIndex is its UI-facing mirror.
  _FilmstripSession _session = const _IdleFilmstripSession();
  bool _isDisposed = false;

  FileViewerFilmstripCoordinator({
    required FileViewerFilmstripCurrentIndex currentIndex,
    required FileViewerFilmstripIdentityAt identityAt,
    required FileViewerFilmstripImmediatePageJump jumpToPageImmediately,
    required VoidCallback requestPauseCurrentMedia,
    FileViewerFilmstripPaintScheduler? scheduleAfterNextFramePaint,
  }) : _currentIndex = currentIndex,
       _identityAt = identityAt,
       _jumpToPageImmediately = jumpToPageImmediately,
       _requestPauseCurrentMedia = requestPauseCurrentMedia,
       _scheduleAfterNextFramePaint =
           scheduleAfterNextFramePaint ?? _afterNextFramePaint;

  ValueListenable<int?> get previewIndex => _previewIndexNotifier;

  bool get isUserScrollSessionActive => _session is _ScrubbingFilmstripSession;

  void handleEvent(FileViewerFilmstripEvent event) {
    if (_isDisposed) return;
    final (:index, :type) = event;

    switch (type) {
      case FileViewerFilmstripEventType.tap:
        reset();
        if (_identityAt(index) == null) return;
        if (index != _currentIndex()) {
          _jumpToPageImmediately(index);
        }
        return;
      case FileViewerFilmstripEventType.scrubStart:
        _setSession(const _ScrubbingFilmstripSession());
        return;
      case FileViewerFilmstripEventType.scrubPreview:
        if (_identityAt(index) == null) return;
        final session = _session is _ScrubbingFilmstripSession
            ? _session as _ScrubbingFilmstripSession
            : const _ScrubbingFilmstripSession();
        final previewIndex = index == _currentIndex() ? null : index;
        final shouldRequestPause =
            previewIndex != null && !session.didRequestPause;
        final nextSession = _ScrubbingFilmstripSession(
          previewIndex: previewIndex,
          didRequestPause: session.didRequestPause || shouldRequestPause,
        );
        _setSession(nextSession);
        if (shouldRequestPause && identical(_session, nextSession)) {
          _requestPauseCurrentMedia();
        }
        return;
      case FileViewerFilmstripEventType.scrubCommit:
        final targetIdentity = _identityAt(index);
        if (targetIdentity == null) {
          reset();
          return;
        }
        _commit(index, targetIdentity);
        return;
    }
  }

  void handlePageChanged(int index, Object fileIdentity) {
    if (_isDisposed) return;
    final pendingSession = _session;
    if (pendingSession is! _AwaitingPagePaintFilmstripSession ||
        pendingSession.hasScheduledPaintBarrier ||
        !_matchesAwaitingSession(pendingSession, index, fileIdentity)) {
      return;
    }
    final session = _AwaitingPagePaintFilmstripSession(
      index,
      fileIdentity,
      hasScheduledPaintBarrier: true,
    );
    _setSession(session);
    _scheduleAfterNextFramePaint(() {
      if (_isDisposed ||
          !identical(_session, session) ||
          _currentIndex() != index ||
          !identical(_identityAt(index), fileIdentity)) {
        return;
      }
      reset();
    });
  }

  void reset() {
    if (_isDisposed) return;
    _setSession(const _IdleFilmstripSession());
  }

  void _commit(int index, Object targetIdentity) {
    if (index == _currentIndex()) {
      final session = _session;
      if (session is! _AwaitingPagePaintFilmstripSession ||
          !_matchesAwaitingSession(session, index, targetIdentity)) {
        reset();
      }
      return;
    }

    final session = _AwaitingPagePaintFilmstripSession(index, targetIdentity);
    _setSession(session);
    if (!identical(_session, session)) return;
    if (!_jumpToPageImmediately(index)) {
      reset();
    }
  }

  bool _matchesAwaitingSession(
    _AwaitingPagePaintFilmstripSession session,
    int index,
    Object identity,
  ) => session.index == index && identical(session.identity, identity);

  void _setSession(_FilmstripSession session) {
    _session = session;
    _previewIndexNotifier.value = session.previewIndex;
  }

  void dispose() {
    _isDisposed = true;
    _session = const _IdleFilmstripSession();
    _previewIndexNotifier.dispose();
  }
}

sealed class _FilmstripSession {
  const _FilmstripSession();

  int? get previewIndex;
}

final class _IdleFilmstripSession extends _FilmstripSession {
  const _IdleFilmstripSession();

  @override
  int? get previewIndex => null;
}

final class _ScrubbingFilmstripSession extends _FilmstripSession {
  @override
  final int? previewIndex;
  final bool didRequestPause;

  const _ScrubbingFilmstripSession({
    this.previewIndex,
    this.didRequestPause = false,
  });
}

final class _AwaitingPagePaintFilmstripSession extends _FilmstripSession {
  final int index;
  final Object identity;
  final bool hasScheduledPaintBarrier;

  @override
  int get previewIndex => index;

  const _AwaitingPagePaintFilmstripSession(
    this.index,
    this.identity, {
    this.hasScheduledPaintBarrier = false,
  });
}

void _afterNextFramePaint(VoidCallback callback) {
  WidgetsBinding.instance.scheduleFrameCallback((_) {
    WidgetsBinding.instance.addPostFrameCallback((_) => callback());
  });
}
