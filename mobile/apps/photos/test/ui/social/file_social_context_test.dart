import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/social/widgets/file_social_overlay.dart";

void main() {
  test("non-hidden opening context excludes hidden collections", () {
    expect(fileSocialContextIncludesHiddenCollections(10, {20}), isFalse);
  });

  test("hidden opening context includes all shared collections", () {
    expect(fileSocialContextIncludesHiddenCollections(20, {20}), isTrue);
  });
}
