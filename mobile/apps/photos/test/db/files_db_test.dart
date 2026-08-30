import "dart:io";

import "package:flutter_test/flutter_test.dart";
import "package:path_provider_platform_interface/path_provider_platform_interface.dart";
import "package:photos/db/files_db.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file/file_type.dart";

void main() {
  late Directory tempDir;
  late PathProviderPlatform previousPathProvider;

  setUpAll(() async {
    previousPathProvider = PathProviderPlatform.instance;
    tempDir = await Directory.systemTemp.createTemp("files_db_test_");
    PathProviderPlatform.instance = _FakePathProvider(tempDir.path);
  });

  tearDownAll(() async {
    await FilesDB.instance.clearTable();
    PathProviderPlatform.instance = previousPathProvider;
    await tempDir.delete(recursive: true);
  });

  test("pagination reaches older rows when failures remain pending", () async {
    final files = List.generate(11, (index) {
      final id = index + 1;
      return EnteFile()
        ..generatedID = id
        ..localID = "local-$id"
        ..title = "$id.jpg"
        ..fileType = FileType.image
        ..creationTime = id <= 2 ? 11 : 12 - id
        ..modificationTime = id <= 2 ? 11 : 12 - id
        ..metadataVersion = 0;
    });
    files.add(
      EnteFile()
        ..generatedID = 31
        ..localID = "local-3"
        ..collectionID = 31
        ..title = "3-copy.jpg"
        ..fileType = FileType.image
        ..creationTime = 9
        ..modificationTime = 9
        ..metadataVersion = 0,
    );
    await FilesDB.instance.insertMultiple(files);

    final visited = <String>[];
    final visitedIDs = <int>[];
    ({int creationTime, int generatedID})? cursor;
    while (true) {
      final page = await FilesDB.instance
          .getUnUploadedLocalFilesPendingOfflineProcessing(
            1,
            limit: 1,
            cursor: cursor,
          );
      if (page.isEmpty) break;

      cursor = (
        creationTime: page.last.creationTime!,
        generatedID: page.last.generatedID!,
      );
      for (final file in page) {
        visited.add(file.localID!);
        visitedIDs.add(file.generatedID!);
        if (int.parse(file.localID!.substring(6)).isEven) {
          await FilesDB.instance.updateOfflineImportMetadataForLocalID(
            file.localID!,
            processingVersion: 1,
          );
        }
      }
    }

    expect(visited, [
      "local-2",
      "local-1",
      ...List.generate(9, (index) => "local-${index + 3}"),
    ]);
    expect(visitedIDs[2], 31);
    final pending = await FilesDB.instance
        .getUnUploadedLocalFilesPendingOfflineProcessing(1, limit: 20);
    expect(pending.map((file) => file.localID), [
      "local-1",
      "local-3",
      "local-5",
      "local-7",
      "local-9",
      "local-11",
    ]);
  });
}

class _FakePathProvider extends PathProviderPlatform {
  _FakePathProvider(this.documentsPath);

  final String documentsPath;

  @override
  Future<String?> getApplicationDocumentsPath() async => documentsPath;
}
