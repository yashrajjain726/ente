import "package:flutter_test/flutter_test.dart";
import "package:photos/models/file/file.dart";
import "package:photos/ui/social/widgets/file_social_overlay.dart";

void main() {
  test("non-hidden opening context excludes hidden collections", () {
    expect(fileSocialContextIncludesHiddenCollections(10, {20}), isFalse);
  });

  test("hidden opening context includes all shared collections", () {
    expect(fileSocialContextIncludesHiddenCollections(20, {20}), isTrue);
  });

  test(
    "widget treats a changed collection ID as a different async context",
    () {
      final file = EnteFile()..uploadedFileID = 100;
      final first = FileSocialOverlay(
        file: file,
        currentUserID: 1,
        openingCollectionID: 10,
      );
      final second = FileSocialOverlay(
        file: file,
        currentUserID: 1,
        openingCollectionID: 20,
      );

      expect(first.contextIdentity, isNot(second.contextIdentity));
    },
  );
}
