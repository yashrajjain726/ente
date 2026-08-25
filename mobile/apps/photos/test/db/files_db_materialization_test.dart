import 'dart:async';
import 'dart:io';

import 'package:computer/computer.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:photos/core/configuration.dart';
import 'package:photos/db/files_db.dart';
import 'package:photos/models/file/file.dart';
import 'package:photos/models/file/file_type.dart';
import 'package:photos/models/metadata/common_keys.dart';
import 'package:photos/services/filter/db_filters.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite_async/sqlite_async.dart';

const _ownerID = 0;
const _sharedOwnerID = 99;
const _ignoredCollectionID = 900;
const _useGeneratedValue = Object();

void main() {
  late Directory temporaryDirectory;
  late SqliteDatabase database;
  late PathProviderPlatform previousPathProvider;
  var startedComputer = false;

  setUpAll(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'files-db-materialization-test-',
    );
    previousPathProvider = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _FakePathProvider(temporaryDirectory.path);
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({Configuration.userIDKey: _ownerID});
    await Configuration.instance.init(await SharedPreferences.getInstance());
    database = SqliteDatabase(
      path: path.join(temporaryDirectory.path, 'files.sqlite'),
    );
    await FilesDB.migrateTestDatabase(database);
    if (!Computer.shared().isRunning) {
      await Computer.shared().turnOn(workersCount: 1);
      startedComputer = true;
    }
  });

  setUp(() async {
    await database.execute('DELETE FROM ${FilesDB.filesTable}');
    await _insertRows(database, _fixtureRows());
  });

  tearDownAll(() async {
    if (startedComputer) {
      await Computer.shared().turnOff();
    }
    await database.close();
    PathProviderPlatform.instance = previousPathProvider;
    await temporaryDirectory.delete(recursive: true);
  });

  test(
    'explicit projection preserves the complete EnteFile contract',
    () async {
      expect(FilesDB.materializedFileColumns, <String>[
        FilesDB.columnGeneratedID,
        FilesDB.columnLocalID,
        FilesDB.columnUploadedFileID,
        FilesDB.columnOwnerID,
        FilesDB.columnCollectionID,
        FilesDB.columnTitle,
        FilesDB.columnDeviceFolder,
        FilesDB.columnLatitude,
        FilesDB.columnLongitude,
        FilesDB.columnFileType,
        FilesDB.columnModificationTime,
        FilesDB.columnEncryptedKey,
        FilesDB.columnKeyDecryptionNonce,
        FilesDB.columnFileDecryptionHeader,
        FilesDB.columnThumbnailDecryptionHeader,
        FilesDB.columnMetadataDecryptionHeader,
        FilesDB.columnCreationTime,
        FilesDB.columnUpdationTime,
        FilesDB.columnFileSubType,
        FilesDB.columnDuration,
        FilesDB.columnExif,
        FilesDB.columnHash,
        FilesDB.columnMetadataVersion,
        FilesDB.columnMMdEncodedJson,
        FilesDB.columnMMdVersion,
        FilesDB.columnMMdVisibility,
        FilesDB.columnPubMMdEncodedJson,
        FilesDB.columnPubMMdVersion,
        FilesDB.columnFileSize,
        FilesDB.columnAddedTime,
      ]);

      final result =
          await FilesDB.forTesting(
            database: database,
            materializationPageSize: 3,
          ).getAllLocalAndUploadedFiles(
            100,
            300,
            _ownerID,
            filterOptions: DBFilterOptions(dedupeUploadID: false),
          );
      final file = result.files.singleWhere((file) => file.generatedID == 16);
      final largeValue = _largeValue('sentinel');

      expect(file.localID, 'sentinel-local');
      expect(file.uploadedFileID, 116);
      expect(file.ownerID, _ownerID);
      expect(file.collectionID, 26);
      expect(file.title, 'sentinel-title');
      expect(file.deviceFolder, 'sentinel-folder');
      expect(file.location?.latitude, 12.25);
      expect(file.location?.longitude, 77.75);
      expect(file.fileType, FileType.video);
      expect(file.creationTime, 210);
      expect(file.modificationTime, 29);
      expect(file.updationTime, 211);
      expect(file.addedTime, 212);
      expect(file.encryptedKey, largeValue);
      expect(file.keyDecryptionNonce, 'sentinel-nonce');
      expect(file.fileDecryptionHeader, largeValue);
      expect(file.thumbnailDecryptionHeader, largeValue);
      expect(file.metadataDecryptionHeader, largeValue);
      expect(file.fileSubType, 7);
      expect(file.duration, 1234);
      expect(file.exif, largeValue);
      expect(file.hash, 'sentinel-hash');
      expect(file.metadataVersion, 3);
      expect(file.fileSize, 987654321);
      expect(file.mMdEncodedJson, '{"visibility":0}');
      expect(file.mMdVersion, 4);
      expect(
        file.pubMmdEncodedJson,
        '{"caption":"sentinel","w":8000,"h":4000}',
      );
      expect(file.pubMmdVersion, 5);
    },
  );

  test(
    'Search matches one-shot total order and defined legacy order',
    () async {
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 3,
      );
      final paged = await filesDB.getAllFilesFromDB(
        const {},
        dedupeByUploadId: false,
      );
      final projection = FilesDB.materializedFileColumns.join(', ');
      final totalOrderRows = await database.getAll(
        'SELECT $projection FROM ${FilesDB.filesTable} '
        'ORDER BY ${FilesDB.columnCreationTime} DESC, '
        '${FilesDB.columnGeneratedID} DESC',
      );
      final legacyRows = await database.getAll(
        'SELECT $projection FROM ${FilesDB.filesTable} '
        'ORDER BY ${FilesDB.columnCreationTime} DESC',
      );

      expect(_ids(paged), _rowIDs(totalOrderRows));
      expect(
        paged.map(_fileSnapshot).toList(),
        totalOrderRows.map(_rowSnapshot).toList(),
      );
      expect(
        paged.map((file) => file.creationTime).toList(),
        legacyRows.map((row) => row[FilesDB.columnCreationTime]).toList(),
      );
      expect(_ids(paged).toSet(), _rowIDs(legacyRows).toSet());
      expect(
        _sortedRowSnapshots(legacyRows),
        _sortedRowSnapshots(totalOrderRows),
      );
    },
  );

  test('Search preserves dedupe, ignored collection, and tie winner', () async {
    final filesDB = FilesDB.forTesting(
      database: database,
      materializationPageSize: 1,
    );

    final all = await filesDB.getAllFilesFromDB(
      const {},
      dedupeByUploadId: false,
    );
    final deduped = await filesDB.getAllFilesFromDB(const {});
    final ignored = await filesDB.getAllFilesFromDB(const {
      _ignoredCollectionID,
    }, dedupeByUploadId: false);

    expect(all, hasLength(20));
    expect(deduped, hasLength(18));
    expect(_ids(deduped), contains(10));
    expect(_ids(deduped), isNot(contains(9)));
    expect(_ids(deduped), contains(8));
    expect(_ids(deduped), isNot(contains(7)));
    expect(_ids(ignored), isNot(anyOf(contains(7), contains(8))));
  });

  test('pending or uploaded preserves predicates and both orders', () async {
    final filesDB = FilesDB.forTesting(
      database: database,
      materializationPageSize: 2,
    );
    final options = DBFilterOptions(dedupeUploadID: false);

    final descending = await filesDB.getAllPendingOrUploadedFiles(
      100,
      300,
      _ownerID,
      filterOptions: options,
    );
    final ascending = await filesDB.getAllPendingOrUploadedFiles(
      100,
      300,
      _ownerID,
      asc: true,
      filterOptions: options,
    );
    final ownerChecked = await filesDB.getAllPendingOrUploadedFiles(
      100,
      300,
      _ownerID,
      applyOwnerCheck: true,
      filterOptions: options,
    );
    final hidden = await filesDB.getAllPendingOrUploadedFiles(
      100,
      300,
      _ownerID,
      visibility: hiddenVisibility,
      filterOptions: options,
    );

    expect(_ids(descending.files), [17, 16, 14, 15, 13, 10, 9, 8, 7, 6, 5, 2]);
    expect(_ids(ascending.files), _ids(descending.files).reversed.toList());
    expect(_ids(ownerChecked.files), [17, 16, 14, 15, 10, 9, 8, 7, 5, 2]);
    expect(_ids(hidden.files), [11]);
    expect(descending.hasMore, isFalse);
  });

  test('pending or uploaded matches a one-shot total-order query', () async {
    final filesDB = FilesDB.forTesting(
      database: database,
      materializationPageSize: 3,
    );
    final result = await filesDB.getAllPendingOrUploadedFiles(
      100,
      300,
      _ownerID,
      filterOptions: DBFilterOptions(dedupeUploadID: false),
    );
    final projection = FilesDB.materializedFileColumns.join(', ');
    final rows = await database.getAll(
      'SELECT $projection FROM ${FilesDB.filesTable} '
      'WHERE ${FilesDB.columnCreationTime} >= ? '
      'AND ${FilesDB.columnCreationTime} <= ? '
      'AND (${FilesDB.columnCollectionID} IS NOT NULL '
      'AND ${FilesDB.columnCollectionID} IS NOT -1) '
      'AND ${FilesDB.columnMMdVisibility} = ? '
      'ORDER BY ${FilesDB.columnCreationTime} DESC, '
      '${FilesDB.columnModificationTime} DESC, '
      '${FilesDB.columnGeneratedID} DESC',
      [100, 300, visibleVisibility],
    );

    expect(_ids(result.files), _rowIDs(rows));
    expect(
      result.files.map(_fileSnapshot).toList(),
      rows.map(_rowSnapshot).toList(),
    );
  });

  test(
    'local and uploaded preserves local, visibility, owner, and saved filters',
    () async {
      final identityFilterDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 3,
        filter: (files, _) async => files,
      );
      final descending = await identityFilterDB.getAllLocalAndUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: DBFilterOptions(dedupeUploadID: false),
      );
      final ascending = await identityFilterDB.getAllLocalAndUploadedFiles(
        100,
        300,
        _ownerID,
        asc: true,
        filterOptions: DBFilterOptions(dedupeUploadID: false),
      );
      final ownedOnly = await identityFilterDB.getAllLocalAndUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: DBFilterOptions(
          dedupeUploadID: false,
          ignoreSharedItems: true,
        ),
      );
      final savedFiltered =
          await FilesDB.forTesting(
            database: database,
            materializationPageSize: 1,
          ).getAllLocalAndUploadedFiles(
            100,
            300,
            _ownerID,
            filterOptions: DBFilterOptions(
              dedupeUploadID: false,
              ignoreSavedFiles: true,
            ),
          );

      expect(_ids(descending.files), [
        17,
        20,
        19,
        16,
        14,
        15,
        13,
        12,
        10,
        9,
        8,
        7,
        6,
        5,
        4,
        3,
        2,
      ]);
      expect(_ids(ascending.files), _ids(descending.files).reversed.toList());
      expect(_ids(ownedOnly.files), [
        17,
        20,
        19,
        16,
        14,
        15,
        12,
        10,
        9,
        8,
        7,
        5,
        4,
        3,
        2,
      ]);
      expect(_ids(savedFiltered.files), isNot(contains(6)));
      expect(_ids(savedFiltered.files), containsAll([5, 13]));
      for (final generatedID in [3, 4]) {
        final pending = descending.files.singleWhere(
          (file) => file.generatedID == generatedID,
        );
        expect(pending.uploadedFileID, isNull);
        expect(pending.collectionID, isNull);
        expect(pending.localID, isNotNull);
      }

      final projection = FilesDB.materializedFileColumns.join(', ');
      final baseQuery =
          'SELECT $projection FROM ${FilesDB.filesTable} '
          'WHERE ${FilesDB.columnCreationTime} >= ? '
          'AND ${FilesDB.columnCreationTime} <= ? '
          'AND (${FilesDB.columnMMdVisibility} IS NULL '
          'OR ${FilesDB.columnMMdVisibility} = ?) '
          'AND (${FilesDB.columnLocalID} IS NOT NULL OR '
          '(${FilesDB.columnCollectionID} IS NOT NULL '
          'AND ${FilesDB.columnCollectionID} IS NOT -1)) ';
      final oneShotDescending = await database.getAll(
        '$baseQuery ORDER BY ${FilesDB.columnCreationTime} DESC, '
        '${FilesDB.columnModificationTime} DESC, '
        '${FilesDB.columnGeneratedID} DESC',
        [100, 300, visibleVisibility],
      );
      final oneShotAscending = await database.getAll(
        '$baseQuery ORDER BY ${FilesDB.columnCreationTime} ASC, '
        '${FilesDB.columnModificationTime} ASC, '
        '${FilesDB.columnGeneratedID} ASC',
        [100, 300, visibleVisibility],
      );
      expect(_ids(descending.files), _rowIDs(oneShotDescending));
      expect(_ids(ascending.files), _rowIDs(oneShotAscending));
      expect(
        descending.files.map(_fileSnapshot).toList(),
        oneShotDescending.map(_rowSnapshot).toList(),
      );
      expect(
        ascending.files.map(_fileSnapshot).toList(),
        oneShotAscending.map(_rowSnapshot).toList(),
      );
    },
  );

  test('limited loads preserve raw-row hasMore semantics', () async {
    Future<(int, bool, FilesDBMaterializationMetrics)> load(int? limit) async {
      late FilesDBMaterializationMetrics metrics;
      final result =
          await FilesDB.forTesting(
            database: database,
            materializationPageSize: 3,
            materializationHooks: FilesDBMaterializationHooks(
              onComplete: (value) => metrics = value,
            ),
          ).getAllPendingOrUploadedFiles(
            100,
            300,
            _ownerID,
            limit: limit,
            filterOptions: DBFilterOptions(dedupeUploadID: false),
          );
      return (result.files.length, result.hasMore, metrics);
    }

    final zero = await load(0);
    expect(
      (zero.$1, zero.$2, zero.$3.rawRows, zero.$3.pageCount),
      (0, true, 0, 0),
    );

    for (final limit in [2, 3, 6, 7]) {
      final value = await load(limit);
      expect(value.$1, limit);
      expect(value.$2, isTrue);
      expect(value.$3.rawRows, limit);
      expect(value.$3.maxRawPage, lessThanOrEqualTo(3));
    }

    final aboveResultSize = await load(50);
    expect((aboveResultSize.$1, aboveResultSize.$2), (12, false));

    final unbounded = await load(null);
    expect((unbounded.$1, unbounded.$2), (12, false));
    expect(unbounded.$3.pageCount, 5);

    final negative = await load(-1);
    expect((negative.$1, negative.$2), (12, false));
    expect(negative.$3.maxRawPage, lessThanOrEqualTo(3));

    late FilesDBMaterializationMetrics filteredMetrics;
    final filtered =
        await FilesDB.forTesting(
          database: database,
          materializationPageSize: 3,
          materializationHooks: FilesDBMaterializationHooks(
            onComplete: (value) => filteredMetrics = value,
          ),
        ).getAllPendingOrUploadedFiles(
          100,
          300,
          _ownerID,
          limit: 7,
          filterOptions: DBFilterOptions(dedupeUploadID: true),
        );
    expect(filtered.hasMore, isTrue);
    expect(filteredMetrics.rawRows, 7);
    expect(filteredMetrics.finalRows, 6);
    expect(filtered.files, hasLength(6));
  });

  test(
    'queries and conversions are sequential and globally filtered once',
    () async {
      var activePageWork = 0;
      var maximumActivePageWork = 0;
      var filterCalls = 0;
      final pageLengths = <int>[];
      final searchConversionLengths = <int>[];
      late FilesDBMaterializationMetrics metrics;

      void startWork() {
        activePageWork++;
        maximumActivePageWork = activePageWork > maximumActivePageWork
            ? activePageWork
            : maximumActivePageWork;
      }

      void finishWork() {
        activePageWork--;
      }

      final result = await FilesDB.forTesting(
        database: database,
        materializationPageSize: 3,
        filter: (files, _) async {
          filterCalls++;
          expect(files, hasLength(20));
          return files;
        },
        materializationHooks: FilesDBMaterializationHooks(
          beforePageQuery: (page, transaction) async => startWork(),
          afterPageQuery: (page, rows, transaction) async {
            pageLengths.add(rows);
            finishWork();
          },
          beforePageConversion: (page, rows) async {
            searchConversionLengths.add(rows);
            startWork();
          },
          afterPageConversion: (page, rows) async => finishWork(),
          onComplete: (value) => metrics = value,
        ),
      ).getAllFilesFromDB(const {}, dedupeByUploadId: false);

      expect(result, hasLength(20));
      expect(filterCalls, 1);
      expect(maximumActivePageWork, 1);
      expect(activePageWork, 0);
      expect(pageLengths.every((length) => length <= 3), isTrue);
      expect(searchConversionLengths.every((length) => length <= 3), isTrue);
      expect(
        searchConversionLengths,
        pageLengths.where((length) => length > 0).toList(),
      );
      expect(metrics.maxRawPage, 3);
      expect(metrics.maxRawPage, lessThanOrEqualTo(metrics.pageSize));
      expect(metrics.rawRows, 20);
      expect(metrics.finalRows, 20);
      expect(metrics.success, isTrue);
      expect(metrics.startCurrentRss, isNotNull);
      expect(metrics.endMaxRss, isNotNull);

      final galleryConversionLengths = <int>[];
      await FilesDB.forTesting(
        database: database,
        materializationPageSize: 3,
        materializationHooks: FilesDBMaterializationHooks(
          beforePageConversion: (page, rows) async {
            galleryConversionLengths.add(rows);
          },
        ),
      ).getAllPendingOrUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: DBFilterOptions(dedupeUploadID: false),
      );
      expect(galleryConversionLengths, isNotEmpty);
      expect(galleryConversionLengths.every((length) => length <= 3), isTrue);
    },
  );

  test(
    'exact Gallery ties use low ID ascending and high ID descending',
    () async {
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 2,
      );
      final options = DBFilterOptions(dedupeUploadID: true);

      final descending = await filesDB.getAllPendingOrUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: options,
      );
      final ascending = await filesDB.getAllPendingOrUploadedFiles(
        100,
        300,
        _ownerID,
        asc: true,
        filterOptions: options,
      );

      expect(_ids(descending.files), contains(10));
      expect(_ids(descending.files), isNot(contains(9)));
      expect(_ids(ascending.files), contains(9));
      expect(_ids(ascending.files), isNot(contains(10)));
    },
  );

  test(
    'page query failure closes the transaction and a retry succeeds',
    () async {
      var shouldFail = true;
      var filterCalls = 0;
      SqliteReadContext? failedTransaction;
      final metrics = <FilesDBMaterializationMetrics>[];
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 2,
        filter: (files, _) async {
          filterCalls++;
          return files;
        },
        materializationHooks: FilesDBMaterializationHooks(
          beforePageQuery: (page, transaction) async {
            if (shouldFail && page == 2) {
              failedTransaction = transaction;
              shouldFail = false;
              await transaction.getAll(
                'SELECT missing_test_column FROM ${FilesDB.filesTable}',
              );
            }
          },
          onComplete: metrics.add,
        ),
      );

      await expectLater(
        filesDB.getAllPendingOrUploadedFiles(
          100,
          300,
          _ownerID,
          filterOptions: DBFilterOptions(dedupeUploadID: false),
        ),
        throwsA(isA<Exception>()),
      );
      expect(filterCalls, 0);
      expect(failedTransaction?.closed, isTrue);
      expect(metrics.single.success, isFalse);
      expect(metrics.single.errorType, 'SqliteException');

      final retry = await filesDB.getAllPendingOrUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: DBFilterOptions(dedupeUploadID: false),
      );
      expect(retry.files, hasLength(12));
      expect(filterCalls, 1);
      expect(metrics.last.success, isTrue);
    },
  );

  test(
    'page conversion failure returns no partial result and permits retry',
    () async {
      var conversionPage = 0;
      var shouldFail = true;
      var filterCalls = 0;
      SqliteReadContext? failedTransaction;
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 2,
        galleryPageConverter: (rows) async {
          conversionPage++;
          if (shouldFail && conversionPage == 2) {
            shouldFail = false;
            throw StateError('injected page conversion failure');
          }
          return _convertRowsForTest(rows);
        },
        filter: (files, _) async {
          filterCalls++;
          return files;
        },
        materializationHooks: FilesDBMaterializationHooks(
          beforePageQuery: (page, transaction) async {
            failedTransaction = transaction;
          },
        ),
      );

      await expectLater(
        filesDB.getAllPendingOrUploadedFiles(
          100,
          300,
          _ownerID,
          filterOptions: DBFilterOptions(dedupeUploadID: false),
        ),
        throwsStateError,
      );
      expect(filterCalls, 0);
      expect(failedTransaction?.closed, isTrue);

      final retry = await filesDB.getAllPendingOrUploadedFiles(
        100,
        300,
        _ownerID,
        filterOptions: DBFilterOptions(dedupeUploadID: false),
      );
      expect(retry.files, hasLength(12));
      expect(filterCalls, 1);
    },
  );

  test(
    'final filter failure cannot escape partial data and permits retry',
    () async {
      var shouldFail = true;
      var filterInputs = 0;
      SqliteReadContext? finalTransaction;
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 3,
        filter: (files, _) async {
          filterInputs = files.length;
          if (shouldFail) {
            shouldFail = false;
            throw StateError('injected final filter failure');
          }
          return files;
        },
        materializationHooks: FilesDBMaterializationHooks(
          beforePageQuery: (page, transaction) async {
            finalTransaction = transaction;
          },
        ),
      );

      await expectLater(
        filesDB.getAllFilesFromDB(const {}, dedupeByUploadId: false),
        throwsStateError,
      );
      expect(filterInputs, 20);
      expect(finalTransaction?.closed, isTrue);

      final retry = await filesDB.getAllFilesFromDB(
        const {},
        dedupeByUploadId: false,
      );
      expect(retry, hasLength(20));
    },
  );

  test(
    'all pages share one snapshot while a concurrent writer proceeds',
    () async {
      final firstPageRead = Completer<void>();
      final releaseReader = Completer<void>();
      final filesDB = FilesDB.forTesting(
        database: database,
        materializationPageSize: 2,
        materializationHooks: FilesDBMaterializationHooks(
          afterPageQuery: (page, rows, transaction) async {
            if (page == 1 && !firstPageRead.isCompleted) {
              firstPageRead.complete();
              await releaseReader.future;
            }
          },
        ),
      );

      final activeRead = filesDB.getAllFilesFromDB(
        const {},
        dedupeByUploadId: false,
      );
      await firstPageRead.future;
      try {
        await _insertRows(database, [
          _row(
            id: 100,
            creationTime: 250,
            modificationTime: 50,
            uploadedFileID: 9100,
            collectionID: 910,
          ),
        ]);
      } finally {
        releaseReader.complete();
      }

      final snapshot = await activeRead;
      expect(snapshot, hasLength(20));
      expect(_ids(snapshot), isNot(contains(100)));

      final nextRead = await filesDB.getAllFilesFromDB(
        const {},
        dedupeByUploadId: false,
      );
      expect(nextRead, hasLength(21));
      expect(_ids(nextRead), contains(100));
    },
  );
}

List<Map<String, Object?>> _fixtureRows() => [
  _row(id: 1, creationTime: 99, modificationTime: 1),
  _row(id: 2, creationTime: 100, modificationTime: 10),
  _row(
    id: 3,
    creationTime: 110,
    modificationTime: 11,
    uploadedFileID: null,
    collectionID: null,
    localID: 'pending-null',
  ),
  _row(
    id: 4,
    creationTime: 120,
    modificationTime: 12,
    uploadedFileID: -1,
    collectionID: -1,
    localID: 'pending-legacy',
  ),
  _row(
    id: 5,
    creationTime: 130,
    modificationTime: 13,
    uploadedFileID: 105,
    collectionID: 15,
    ownerID: _ownerID,
    hash: 'owned-shared-hash',
  ),
  _row(
    id: 6,
    creationTime: 130,
    modificationTime: 13,
    uploadedFileID: 106,
    collectionID: 16,
    ownerID: _sharedOwnerID,
    hash: 'owned-shared-hash',
  ),
  _row(
    id: 7,
    creationTime: 140,
    modificationTime: 14,
    uploadedFileID: 600,
    collectionID: 100,
  ),
  _row(
    id: 8,
    creationTime: 150,
    modificationTime: 15,
    uploadedFileID: 600,
    collectionID: _ignoredCollectionID,
  ),
  _row(
    id: 9,
    creationTime: 160,
    modificationTime: 16,
    uploadedFileID: 500,
    collectionID: 201,
  ),
  _row(
    id: 10,
    creationTime: 160,
    modificationTime: 16,
    uploadedFileID: 500,
    collectionID: 202,
  ),
  _row(
    id: 11,
    creationTime: 170,
    modificationTime: 20,
    visibility: hiddenVisibility,
  ),
  _row(id: 12, creationTime: 180, modificationTime: 21, visibility: null),
  _row(
    id: 13,
    creationTime: 190,
    modificationTime: 22,
    ownerID: _sharedOwnerID,
  ),
  _row(id: 14, creationTime: 200, modificationTime: 31, ownerID: null),
  _row(id: 15, creationTime: 200, modificationTime: 30),
  _row(
    id: 16,
    creationTime: 210,
    modificationTime: 29,
    uploadedFileID: 116,
    collectionID: 26,
    localID: 'sentinel-local',
    title: 'sentinel-title',
    deviceFolder: 'sentinel-folder',
    latitude: 12.25,
    longitude: 77.75,
    fileType: 1,
    updationTime: 211,
    addedTime: 212,
    encryptedKey: _largeValue('sentinel'),
    keyDecryptionNonce: 'sentinel-nonce',
    fileDecryptionHeader: _largeValue('sentinel'),
    thumbnailDecryptionHeader: _largeValue('sentinel'),
    metadataDecryptionHeader: _largeValue('sentinel'),
    fileSubType: 7,
    duration: 1234,
    exif: _largeValue('sentinel'),
    hash: 'sentinel-hash',
    metadataVersion: 3,
    mMdVersion: 4,
    pubMmdEncodedJson: '{"caption":"sentinel","w":8000,"h":4000}',
    pubMmdVersion: 5,
    fileSize: 987654321,
  ),
  _row(id: 17, creationTime: 300, modificationTime: 40),
  _row(id: 18, creationTime: 301, modificationTime: 41),
  _row(
    id: 19,
    creationTime: 220,
    modificationTime: 31,
    uploadedFileID: null,
    collectionID: null,
    localID: 'pending-null-late',
  ),
  _row(
    id: 20,
    creationTime: 230,
    modificationTime: 32,
    uploadedFileID: -1,
    collectionID: -1,
    localID: 'pending-legacy-late',
  ),
];

Map<String, Object?> _row({
  required int id,
  required int creationTime,
  required int modificationTime,
  Object? uploadedFileID = _useGeneratedValue,
  Object? collectionID = _useGeneratedValue,
  Object? ownerID = _ownerID,
  String? localID,
  String? title,
  String? deviceFolder,
  double? latitude,
  double? longitude,
  int fileType = 0,
  int? updationTime,
  int? addedTime,
  String? encryptedKey,
  String? keyDecryptionNonce,
  String? fileDecryptionHeader,
  String? thumbnailDecryptionHeader,
  String? metadataDecryptionHeader,
  int? fileSubType,
  int? duration,
  String? exif,
  String? hash,
  int? metadataVersion,
  String? mMdEncodedJson,
  int? mMdVersion,
  Object? visibility = visibleVisibility,
  String? pubMmdEncodedJson,
  int? pubMmdVersion,
  int? fileSize,
}) {
  final resolvedUploadID = identical(uploadedFileID, _useGeneratedValue)
      ? 1000 + id
      : uploadedFileID;
  final resolvedCollectionID = identical(collectionID, _useGeneratedValue)
      ? 100 + id
      : collectionID;
  return {
    FilesDB.columnGeneratedID: id,
    FilesDB.columnLocalID: localID,
    FilesDB.columnUploadedFileID: resolvedUploadID,
    FilesDB.columnOwnerID: ownerID,
    FilesDB.columnCollectionID: resolvedCollectionID,
    FilesDB.columnTitle: title ?? 'fixture-$id',
    FilesDB.columnDeviceFolder: deviceFolder,
    FilesDB.columnLatitude: latitude,
    FilesDB.columnLongitude: longitude,
    FilesDB.columnFileType: fileType,
    FilesDB.columnModificationTime: modificationTime,
    FilesDB.columnEncryptedKey: encryptedKey,
    FilesDB.columnKeyDecryptionNonce: keyDecryptionNonce,
    FilesDB.columnFileDecryptionHeader: fileDecryptionHeader,
    FilesDB.columnThumbnailDecryptionHeader: thumbnailDecryptionHeader,
    FilesDB.columnMetadataDecryptionHeader: metadataDecryptionHeader,
    FilesDB.columnCreationTime: creationTime,
    FilesDB.columnUpdationTime: updationTime,
    FilesDB.columnFileSubType: fileSubType,
    FilesDB.columnDuration: duration,
    FilesDB.columnExif: exif,
    FilesDB.columnHash: hash ?? 'hash-$id',
    FilesDB.columnMetadataVersion: metadataVersion,
    FilesDB.columnMMdEncodedJson:
        mMdEncodedJson ?? '{"visibility":${visibility ?? visibleVisibility}}',
    FilesDB.columnMMdVersion: mMdVersion,
    FilesDB.columnMMdVisibility: visibility,
    FilesDB.columnPubMMdEncodedJson: pubMmdEncodedJson ?? '{}',
    FilesDB.columnPubMMdVersion: pubMmdVersion,
    FilesDB.columnFileSize: fileSize,
    FilesDB.columnAddedTime: addedTime ?? -1,
  };
}

Future<void> _insertRows(
  SqliteDatabase database,
  List<Map<String, Object?>> rows,
) async {
  final columns = FilesDB.materializedFileColumns;
  final placeholders = List.filled(columns.length, '?').join(', ');
  await database.executeBatch(
    'INSERT INTO ${FilesDB.filesTable} (${columns.join(', ')}) '
    'VALUES ($placeholders)',
    rows
        .map((row) => columns.map<Object?>((column) => row[column]).toList())
        .toList(),
  );
}

List<EnteFile> _convertRowsForTest(List<Map<String, dynamic>> rows) =>
    rows.map((row) {
      final file = EnteFile();
      file.generatedID = row[FilesDB.columnGeneratedID];
      file.localID = row[FilesDB.columnLocalID];
      final uploadedID = row[FilesDB.columnUploadedFileID];
      file.uploadedFileID = uploadedID == -1 ? null : uploadedID;
      file.ownerID = row[FilesDB.columnOwnerID];
      final collectionID = row[FilesDB.columnCollectionID];
      file.collectionID = collectionID == -1 ? null : collectionID;
      file.title = row[FilesDB.columnTitle];
      file.fileType = getFileType(row[FilesDB.columnFileType]);
      file.creationTime = row[FilesDB.columnCreationTime];
      file.modificationTime = row[FilesDB.columnModificationTime];
      file.hash = row[FilesDB.columnHash];
      file.mMdEncodedJson = row[FilesDB.columnMMdEncodedJson];
      file.pubMmdEncodedJson = row[FilesDB.columnPubMMdEncodedJson];
      return file;
    }).toList();

List<int> _ids(Iterable<EnteFile> files) =>
    files.map((file) => file.generatedID!).toList();

List<int> _rowIDs(Iterable<Map<String, dynamic>> rows) =>
    rows.map((row) => row[FilesDB.columnGeneratedID] as int).toList();

Map<String, Object?> _fileSnapshot(EnteFile file) => {
  'generatedID': file.generatedID,
  'localID': file.localID,
  'uploadedFileID': file.uploadedFileID,
  'ownerID': file.ownerID,
  'collectionID': file.collectionID,
  'title': file.title,
  'deviceFolder': file.deviceFolder,
  'latitude': file.location?.latitude,
  'longitude': file.location?.longitude,
  'fileType': file.fileType.name,
  'creationTime': file.creationTime,
  'modificationTime': file.modificationTime,
  'updationTime': file.updationTime,
  'addedTime': file.addedTime,
  'encryptedKey': file.encryptedKey,
  'keyDecryptionNonce': file.keyDecryptionNonce,
  'fileDecryptionHeader': file.fileDecryptionHeader,
  'thumbnailDecryptionHeader': file.thumbnailDecryptionHeader,
  'metadataDecryptionHeader': file.metadataDecryptionHeader,
  'fileSubType': file.fileSubType,
  'duration': file.duration,
  'exif': file.exif,
  'hash': file.hash,
  'metadataVersion': file.metadataVersion,
  'fileSize': file.fileSize,
  'mMdEncodedJson': file.mMdEncodedJson,
  'mMdVersion': file.mMdVersion,
  'pubMmdEncodedJson': file.pubMmdEncodedJson,
  'pubMmdVersion': file.pubMmdVersion,
};

Map<String, Object?> _rowSnapshot(Map<String, dynamic> row) {
  final uploadedID = row[FilesDB.columnUploadedFileID];
  final collectionID = row[FilesDB.columnCollectionID];
  final hasLocation =
      row[FilesDB.columnLatitude] != null &&
      row[FilesDB.columnLongitude] != null;
  return {
    'generatedID': row[FilesDB.columnGeneratedID],
    'localID': row[FilesDB.columnLocalID],
    'uploadedFileID': uploadedID == -1 ? null : uploadedID,
    'ownerID': row[FilesDB.columnOwnerID],
    'collectionID': collectionID == -1 ? null : collectionID,
    'title': row[FilesDB.columnTitle],
    'deviceFolder': row[FilesDB.columnDeviceFolder],
    'latitude': hasLocation ? row[FilesDB.columnLatitude] : null,
    'longitude': hasLocation ? row[FilesDB.columnLongitude] : null,
    'fileType': getFileType(row[FilesDB.columnFileType]).name,
    'creationTime': row[FilesDB.columnCreationTime],
    'modificationTime': row[FilesDB.columnModificationTime],
    'updationTime': row[FilesDB.columnUpdationTime] ?? -1,
    'addedTime': row[FilesDB.columnAddedTime],
    'encryptedKey': row[FilesDB.columnEncryptedKey],
    'keyDecryptionNonce': row[FilesDB.columnKeyDecryptionNonce],
    'fileDecryptionHeader': row[FilesDB.columnFileDecryptionHeader],
    'thumbnailDecryptionHeader': row[FilesDB.columnThumbnailDecryptionHeader],
    'metadataDecryptionHeader': row[FilesDB.columnMetadataDecryptionHeader],
    'fileSubType': row[FilesDB.columnFileSubType] ?? -1,
    'duration': row[FilesDB.columnDuration] ?? 0,
    'exif': row[FilesDB.columnExif],
    'hash': row[FilesDB.columnHash],
    'metadataVersion': row[FilesDB.columnMetadataVersion] ?? 0,
    'fileSize': row[FilesDB.columnFileSize],
    'mMdEncodedJson': row[FilesDB.columnMMdEncodedJson] ?? '{}',
    'mMdVersion': row[FilesDB.columnMMdVersion] ?? 0,
    'pubMmdEncodedJson': row[FilesDB.columnPubMMdEncodedJson] ?? '{}',
    'pubMmdVersion': row[FilesDB.columnPubMMdVersion] ?? 0,
  };
}

List<Map<String, Object?>> _sortedRowSnapshots(
  Iterable<Map<String, dynamic>> rows,
) {
  final snapshots = rows.map(_rowSnapshot).toList();
  snapshots.sort(
    (left, right) =>
        (left['generatedID'] as int).compareTo(right['generatedID'] as int),
  );
  return snapshots;
}

String _largeValue(String prefix) => '$prefix-${List.filled(4096, 'x').join()}';

class _FakePathProvider extends PathProviderPlatform {
  final String rootPath;

  _FakePathProvider(this.rootPath);

  @override
  Future<String?> getApplicationDocumentsPath() async => rootPath;

  @override
  Future<String?> getApplicationSupportPath() async => rootPath;

  @override
  Future<String?> getTemporaryPath() async => rootPath;
}
