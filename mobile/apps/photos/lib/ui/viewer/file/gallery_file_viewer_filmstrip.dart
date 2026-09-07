import "package:ente_strings/ente_strings.dart";
import "package:flutter/foundation.dart";
import "package:flutter/material.dart";
import "package:photos/core/constants.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file/file_type.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_event.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_preview_layer.dart";
import "package:photos/ui/viewer/file/thumbnail_widget.dart";

/// Spacing contributed by the filmstrip to the gallery viewer's chrome.
abstract final class GalleryFileViewerFilmstripLayout {
  static const bottomControlsGap = 6.0;
  static const upperContentGap = 6.0;
  static const additionalBottomInset =
      FileViewerFilmstripLayout.height + bottomControlsGap + upperContentGap;
}

/// Whether the gallery-specific viewer may expose its neighboring files.
bool shouldShowGalleryFileViewerFilmstrip({
  required bool isEnabled,
  required bool isMinimalistic,
  required bool isGuestView,
  required int itemCount,
}) => isEnabled && !isMinimalistic && !isGuestView && itemCount > 1;

/// Renders the opaque, lightweight gallery thumbnail used while scrubbing.
///
/// This widget returns [Positioned.fill], so its parent must be a [Stack].
class GalleryFileViewerFilmstripPreviewLayer extends StatelessWidget {
  final List<EnteFile> files;
  final ValueListenable<int?> previewIndex;

  const GalleryFileViewerFilmstripPreviewLayer({
    required this.files,
    required this.previewIndex,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return FileViewerFilmstripPreviewLayer(
      previewIndex: previewIndex,
      itemBuilder: (context, index) {
        if (index < 0 || index >= files.length) {
          return const SizedBox.shrink();
        }
        return _GalleryFilmstripThumbnail(
          file: files[index],
          fit: BoxFit.contain,
        );
      },
    );
  }
}

/// Positions and presents the filmstrip above the gallery viewer's controls.
///
/// This widget returns [Positioned], so its parent must be a [Stack].
class GalleryFileViewerFilmstripOverlay extends StatelessWidget {
  final List<EnteFile> files;
  final int selectedIndex;
  final double bottomControlsHeight;
  final int? Function(Key key) findChildIndexCallback;
  final ValueListenable<bool> enableFullScreenNotifier;
  final FileViewerFilmstripEventCallback onEvent;

  const GalleryFileViewerFilmstripOverlay({
    required this.files,
    required this.selectedIndex,
    required this.bottomControlsHeight,
    required this.findChildIndexCallback,
    required this.enableFullScreenNotifier,
    required this.onEvent,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final safePadding = MediaQuery.paddingOf(context);
    return Positioned(
      left: safePadding.left,
      right: safePadding.right,
      bottom:
          safePadding.bottom +
          bottomControlsHeight +
          GalleryFileViewerFilmstripLayout.bottomControlsGap,
      height: FileViewerFilmstripLayout.height,
      child: ValueListenableBuilder<bool>(
        valueListenable: enableFullScreenNotifier,
        builder: (context, isFullScreen, child) => IgnorePointer(
          ignoring: isFullScreen,
          child: AnimatedOpacity(
            opacity: isFullScreen ? 0 : 1,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeInOut,
            child: child,
          ),
        ),
        child: FileViewerFilmstrip(
          itemCount: files.length,
          selectedIndex: selectedIndex,
          semanticLabel: context.strings.photoViewerFilmstripLabel,
          semanticValueBuilder: (current, total) => context.strings
              .photoViewerFilmstripPosition(current: current, total: total),
          itemKeyBuilder: (index) => ObjectKey(files[index]),
          findChildIndexCallback: findChildIndexCallback,
          itemBuilder: (context, index) {
            final file = files[index];
            return Stack(
              fit: StackFit.expand,
              children: [
                _GalleryFilmstripThumbnail(file: file, fit: BoxFit.cover),
                if (file.fileType == FileType.video)
                  const Center(
                    child: Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 14,
                      shadows: [Shadow(color: Colors.black87, blurRadius: 3)],
                    ),
                  ),
              ],
            );
          },
          onEvent: onEvent,
        ),
      ),
    );
  }
}

class _GalleryFilmstripThumbnail extends StatelessWidget {
  final EnteFile file;
  final BoxFit fit;

  const _GalleryFilmstripThumbnail({required this.file, required this.fit});

  @override
  Widget build(BuildContext context) {
    return ThumbnailWidget(
      file,
      key: ObjectKey(file),
      rawThumbnail: true,
      diskLoadDeferDuration: galleryThumbnailDiskLoadDeferDuration,
      serverLoadDeferDuration: galleryThumbnailServerLoadDeferDuration,
      shouldShowSyncStatus: false,
      shouldShowFavoriteIcon: false,
      shouldShowVideoOverlayIcon: false,
      shouldShowLivePhotoOverlay: false,
      fit: fit,
    );
  }
}
