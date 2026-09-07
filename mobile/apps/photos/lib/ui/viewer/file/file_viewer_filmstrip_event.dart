import "package:flutter/foundation.dart";

/// The interaction that caused a [FileViewerFilmstripEvent].
enum FileViewerFilmstripEventType { tap, scrubStart, scrubPreview, scrubCommit }

/// A user interaction emitted by the filmstrip.
///
/// Scrub start and commit are lifecycle events, so they are emitted even when
/// [index] has not changed. Preview and tap events identify a newly focused
/// item.
typedef FileViewerFilmstripEvent = ({
  int index,
  FileViewerFilmstripEventType type,
});

typedef FileViewerFilmstripEventCallback =
    ValueChanged<FileViewerFilmstripEvent>;
