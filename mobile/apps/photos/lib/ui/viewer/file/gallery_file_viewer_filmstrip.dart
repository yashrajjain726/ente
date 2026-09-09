import "package:ente_components/ente_components.dart" show fillDarkDark;
import "package:ente_strings/ente_strings.dart";
import "package:flutter/foundation.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:photos/core/constants.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file/file_type.dart";
import "package:photos/service_locator.dart";
import "package:photos/theme/colors.dart" show strokeFaintDark;
import "package:photos/ui/viewer/file/file_viewer_filmstrip.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_event.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_preview_layer.dart";
import "package:photos/ui/viewer/file/thumbnail_widget.dart";

/// Spacing contributed by the filmstrip to the gallery viewer's chrome.
abstract final class GalleryFileViewerFilmstripLayout {
  static const upperContentGap = 6.0;
  static const additionalBottomInset =
      FileViewerFilmstripLayout.height + upperContentGap;
}

/// Keeps the filmstrip limited to internal users while it is being evaluated.
bool get isGalleryFileViewerFilmstripEnabled => flagService.internalUser;

/// Whether the gallery-specific viewer may expose its neighboring files.
bool shouldShowGalleryFileViewerFilmstrip({
  required bool isFeatureEnabled,
  required bool isEnabled,
  required bool isMinimalistic,
  required bool isGuestView,
  required int itemCount,
}) =>
    isFeatureEnabled &&
    isEnabled &&
    !isMinimalistic &&
    !isGuestView &&
    itemCount > 1;

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
        final file = files[index];
        return Stack(
          fit: StackFit.expand,
          children: [
            _GalleryFilmstripThumbnail(file: file, fit: BoxFit.contain),
            if (file.fileType == FileType.video)
              Center(
                child: Container(
                  width: 54,
                  height: 54,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.3),
                    shape: BoxShape.circle,
                    border: Border.all(color: strokeFaintDark, width: 1),
                  ),
                  child: const HugeIcon(
                    icon: HugeIcons.strokeRoundedPlay,
                    size: 32,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
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
      bottom: safePadding.bottom + bottomControlsHeight,
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
      placeholderColor: fillDarkDark,
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
