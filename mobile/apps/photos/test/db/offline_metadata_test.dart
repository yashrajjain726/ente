import "dart:convert";
import "dart:io";

import "package:flutter_test/flutter_test.dart";
import "package:path_provider_platform_interface/path_provider_platform_interface.dart";
import "package:photos/db/files_db.dart";
import "package:photos/models/file/file.dart";
import "package:photos/module/metadata/local_file.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final files = FilesDB.instance;
  late Directory directory;
  late PathProviderPlatform previousPathProvider;

  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp("offline_metadata_");
    previousPathProvider = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _PathProvider(directory.path);
  });

  tearDownAll(() async {
    await (await files.sqliteAsyncDB).close();
    PathProviderPlatform.instance = previousPathProvider;
    await directory.delete(recursive: true);
  });

  test(
    "persists dimensions, refreshes edits and rejects stale results only for local rows",
    () async {
      final db = await files.sqliteAsyncDB;
      for (final (uploadedID, collectionID) in [(-1, 1), (-1, 2), (99, 3)]) {
        await db.execute(
          '''
        INSERT INTO ${FilesDB.filesTable}
          (${FilesDB.columnLocalID}, ${FilesDB.columnUploadedFileID},
           ${FilesDB.columnCollectionID}, ${FilesDB.columnTitle},
           ${FilesDB.columnCreationTime}, ${FilesDB.columnModificationTime},
           ${FilesDB.columnMetadataVersion}, ${FilesDB.columnPubMMdEncodedJson})
        VALUES ('local', ?, ?, 'photo.jpg', 100, 100, 1, ?)
      ''',
          [uploadedID, collectionID, '{"caption":"Keep me","w":4000,"h":3000}'],
        );
      }

      expect(
        await files.updateOfflineImportMetadataForLocalID(
          "local",
          processingVersion: 2,
          modificationTime: 100,
          dimensions: (width: 3000, height: 4000),
        ),
        isTrue,
      );

      final rows = await db.getAll(
        'SELECT * FROM ${FilesDB.filesTable} ORDER BY ${FilesDB.columnCollectionID}',
      );
      for (final row in rows.take(2)) {
        final file = EnteFile()
          ..pubMmdEncodedJson = row[FilesDB.columnPubMMdEncodedJson] as String;
        expect((file.width, file.height), (3000, 4000));
        expect(file.pubMagicMetadata!.caption, "Keep me");
        expect(row[FilesDB.columnMetadataVersion], 2);
      }
      expect(
        jsonDecode(rows.last[FilesDB.columnPubMMdEncodedJson] as String)['w'],
        4000,
      );
      expect(rows.last[FilesDB.columnMetadataVersion], 1);

      final edited = EnteFile()
        ..localID = "local"
        ..modificationTime = 200;
      applyDisplayDimensions(edited, 800, 600);
      await files.refreshLocalDimensions([edited]);
      expect(
        await files.updateOfflineImportMetadataForLocalID(
          "local",
          processingVersion: 2,
          modificationTime: 100,
          dimensions: (width: 3000, height: 4000),
        ),
        isFalse,
      );
      final pending = await db.getAll(
        'SELECT * FROM ${FilesDB.filesTable} WHERE ${FilesDB.columnMetadataVersion} = -1',
      );
      expect(pending, hasLength(2));
      expect(
        jsonDecode(pending.first[FilesDB.columnPubMMdEncodedJson] as String),
        {"caption": "Keep me", "w": 800, "h": 600},
      );

      expect(
        await files.updateOfflineImportMetadataForLocalID(
          "local",
          processingVersion: 2,
          modificationTime: 200,
        ),
        isTrue,
      );
      await files.refreshLocalDimensions([edited]);
      expect(
        await db.getAll(
          'SELECT * FROM ${FilesDB.filesTable} WHERE ${FilesDB.columnMetadataVersion} = -1',
        ),
        isEmpty,
      );
      final refreshed = await db.getAll(
        'SELECT * FROM ${FilesDB.filesTable} WHERE ${FilesDB.columnUploadedFileID} = -1',
      );
      expect(
        jsonDecode(
          refreshed.first[FilesDB.columnPubMMdEncodedJson] as String,
        )['w'],
        800,
      );
    },
  );
}

class _PathProvider extends PathProviderPlatform {
  _PathProvider(this.path);
  final String path;

  @override
  Future<String?> getApplicationDocumentsPath() async => path;
}
