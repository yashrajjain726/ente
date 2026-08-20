import "package:photos/service_locator.dart";
import "package:photos/settings/local_settings.dart";

// FlagService treats debug builds as internal while still honoring the
// developer setting that disables internal-user features.
bool get isMosaicLayoutAvailable => flagService.internalUser;

GalleryLayoutType resolveGalleryLayoutType(
  GalleryLayoutType preferredLayoutType, {
  bool? mosaicLayoutAvailable,
}) {
  final isAvailable = mosaicLayoutAvailable ?? isMosaicLayoutAvailable;
  if (preferredLayoutType == GalleryLayoutType.mosaic && !isAvailable) {
    return GalleryLayoutType.grid;
  }
  return preferredLayoutType;
}
