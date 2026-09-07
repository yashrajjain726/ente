import "package:flutter_test/flutter_test.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file/file_type.dart";
import "package:photos/ui/viewer/file/detail_page.dart";

void main() {
  test("gallery filmstrip defaults off and copyWith preserves opt-in", () {
    final file = EnteFile()..fileType = FileType.image;

    final genericConfig = DetailPageConfiguration([file], 0, "generic");
    expect(genericConfig.showGalleryFilmstrip, isFalse);

    final galleryConfig = DetailPageConfiguration(
      [file],
      0,
      "gallery",
      showGalleryFilmstrip: true,
    );
    expect(galleryConfig.copyWith().showGalleryFilmstrip, isTrue);
  });
}
