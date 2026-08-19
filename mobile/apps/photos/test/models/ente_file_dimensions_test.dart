import "package:flutter_test/flutter_test.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/metadata/file_magic.dart";

void main() {
  test("dimensions are decoded directly from public metadata", () {
    final file = EnteFile()
      ..pubMmdEncodedJson = '{"caption":"hello","w":4032,"h":"3024"}';

    expect(file.width, 4032);
    expect(file.height, 3024);
    expect(file.pubMmdEncodedJson, contains('"caption":"hello"'));
  });

  test("dimension cache is invalidated when encoded metadata changes", () {
    final file = EnteFile()..pubMmdEncodedJson = '{"w":10,"h":20}';
    expect((file.width, file.height), (10, 20));

    file.pubMmdEncodedJson = '{"w":30,"h":40}';
    expect((file.width, file.height), (30, 40));
  });

  test("decoded public metadata supplies and updates dimensions", () {
    final file = EnteFile()..pubMagicMetadata = PubMagicMetadata(w: 50, h: 60);
    expect((file.width, file.height), (50, 60));

    file.pubMagicMetadata = PubMagicMetadata(w: 70, h: 80);
    expect((file.width, file.height), (70, 80));
  });

  test("missing dimensions use zero", () {
    final file = EnteFile()..pubMmdEncodedJson = '{"caption":"hello"}';
    expect((file.width, file.height), (0, 0));
  });
}
