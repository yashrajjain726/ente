import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:computer/computer.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photos/db/files_db.dart';
import 'package:photos/models/file/file.dart';
import 'package:photos/services/filter/db_filters.dart';
import 'package:sqlite_async/sqlite_async.dart';

const _fixtureRows = 100000;
const _fixtureSeed = 20260825;
const _marker = 'FILESDB_BENCHMARK_JSON ';
const _searchFamily = 'search_all_files';
const _pendingFamily = 'gallery_pending_or_uploaded';
const _localFamily = 'gallery_local_and_uploaded';

void main() {
  final environment = Platform.environment;
  final mode = environment['FILESDB_BENCHMARK_MODE'];
  final databasePath = environment['FILESDB_BENCHMARK_DB'];

  if (mode == null || databasePath == null) {
    test(
      'FilesDB materialization benchmark worker',
      () {},
      skip: 'non-CI benchmark; run through the benchmark script',
    );
    return;
  }

  test(
    'FilesDB materialization benchmark worker',
    () async {
      if (mode == 'build') {
        await _buildFixture(databasePath);
        return;
      }
      if (mode != 'run') {
        fail('Unknown FILESDB_BENCHMARK_MODE: $mode');
      }

      final variant = environment['FILESDB_BENCHMARK_VARIANT'] ?? 'paged';
      final runKind = environment['FILESDB_BENCHMARK_RUN_KIND'] ?? 'measured';
      final family = environment['FILESDB_BENCHMARK_FAMILY'] ?? _searchFamily;
      final pageSize = int.parse(
        environment['FILESDB_BENCHMARK_PAGE_SIZE'] ??
            FilesDB.defaultMaterializationPageSize.toString(),
      );
      await _runBenchmark(
        databasePath: databasePath,
        variant: variant,
        runKind: runKind,
        family: family,
        pageSize: pageSize,
      );
    },
    timeout: const Timeout(Duration(minutes: 15)),
  );
}

Future<void> _buildFixture(String databasePath) async {
  final file = File(databasePath);
  await file.parent.create(recursive: true);
  if (await file.exists()) {
    await file.delete();
  }
  final database = SqliteDatabase(path: databasePath);
  try {
    await FilesDB.migrateTestDatabase(database);
    final columns = FilesDB.materializedFileColumns;
    final placeholders = List.filled(columns.length, '?').join(', ');
    final insertStatement =
        'INSERT INTO ${FilesDB.filesTable} (${columns.join(', ')}) '
        'VALUES ($placeholders)';
    final random = Random(_fixtureSeed);
    const batchSize = 1000;

    for (var first = 1; first <= _fixtureRows; first += batchSize) {
      final last = min(_fixtureRows + 1, first + batchSize);
      final parameterSets = <List<Object?>>[];
      for (var id = first; id < last; id++) {
        final creationTime = 2000000000000000 - (id ~/ 4);
        final modificationTime = creationTime + random.nextInt(7);
        final values = _fixtureValues(
          id: id,
          creationTime: creationTime,
          modificationTime: modificationTime,
        );
        parameterSets.add(
          columns.map<Object?>((column) => values[column]).toList(),
        );
      }
      await database.executeBatch(insertStatement, parameterSets);
    }

    final countRows = await database.getAll(
      'SELECT COUNT(*) AS count FROM ${FilesDB.filesTable}',
    );
    expect(countRows.single['count'], _fixtureRows);
    await database.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    stdout.writeln(
      '$_marker${jsonEncode({'event': 'fixture', 'rows': _fixtureRows, 'seed': _fixtureSeed, 'databaseBytes': await file.length()})}',
    );
  } finally {
    await database.close();
  }
}

Future<void> _runBenchmark({
  required String databasePath,
  required String variant,
  required String runKind,
  required String family,
  required int pageSize,
}) async {
  final database = SqliteDatabase(path: databasePath);
  await database.initialize();
  await Computer.shared().turnOn(workersCount: 1);
  try {
    if (runKind == 'warmup') {
      await _writeQueryPlan(database, family);
    }
    final startCurrentRss = ProcessInfo.currentRss;
    final startMaxRss = ProcessInfo.maxRss;
    final wallWatch = Stopwatch()..start();

    late final Map<String, Object?> measurement;
    if (variant == 'legacy') {
      measurement = await _runLegacy(database, family);
    } else if (variant == 'paged') {
      measurement = await _runPaged(database, pageSize, family);
    } else {
      fail('Unknown FILESDB_BENCHMARK_VARIANT: $variant');
    }

    wallWatch.stop();
    measurement.addAll({
      'event': 'measurement',
      'variant': variant,
      'benchmarkFamily': family,
      'runKind': runKind,
      'seed': _fixtureSeed,
      'fixtureRows': _fixtureRows,
      'pageSize': variant == 'legacy' ? null : pageSize,
      'wallMicros': wallWatch.elapsedMicroseconds,
      'startCurrentRss': startCurrentRss,
      'endCurrentRss': ProcessInfo.currentRss,
      'startMaxRss': startMaxRss,
      'endMaxRss': ProcessInfo.maxRss,
    });
    expect(measurement['rawRows'], _fixtureRows);
    expect(measurement['finalRows'], _fixtureRows);
    if (variant == 'legacy') {
      expect(measurement['maxRawPage'], _fixtureRows);
    } else {
      expect(measurement['maxRawPage'], lessThanOrEqualTo(pageSize));
      expect(measurement['maxRawPage'], lessThanOrEqualTo(5000));
    }
    stdout.writeln('$_marker${jsonEncode(measurement)}');
  } finally {
    await Computer.shared().turnOff();
    await database.close();
  }
}

Future<Map<String, Object?>> _runPaged(
  SqliteDatabase database,
  int pageSize,
  String family,
) async {
  late FilesDBMaterializationMetrics metrics;
  final filesDB = FilesDB.forTesting(
    database: database,
    materializationPageSize: pageSize,
    materializationHooks: FilesDBMaterializationHooks(
      onComplete: (value) => metrics = value,
    ),
  );
  final options = DBFilterOptions(dedupeUploadID: false);
  final int finalRows;
  switch (family) {
    case _searchFamily:
      finalRows = (await filesDB.getAllFilesFromDB(
        const {},
        dedupeByUploadId: false,
      )).length;
    case _pendingFamily:
      finalRows = (await filesDB.getAllPendingOrUploadedFiles(
        0,
        3000000000000000,
        1,
        filterOptions: options,
      )).files.length;
    case _localFamily:
      finalRows = (await filesDB.getAllLocalAndUploadedFiles(
        0,
        3000000000000000,
        1,
        filterOptions: options,
      )).files.length;
    default:
      fail('Unknown FILESDB_BENCHMARK_FAMILY: $family');
  }
  expect(finalRows, _fixtureRows);
  return metrics.toJson();
}

Future<Map<String, Object?>> _runLegacy(
  SqliteDatabase database,
  String family,
) async {
  late final String query;
  late final List<Object?> arguments;
  late final bool convertInWorker;
  switch (family) {
    case _searchFamily:
      query =
          'SELECT * FROM ${FilesDB.filesTable} '
          'ORDER BY ${FilesDB.columnCreationTime} DESC';
      arguments = const [];
      convertInWorker = true;
    case _pendingFamily:
      query =
          'SELECT * FROM ${FilesDB.filesTable} '
          'WHERE ${FilesDB.columnCreationTime} >= ? '
          'AND ${FilesDB.columnCreationTime} <= ? '
          'AND (${FilesDB.columnCollectionID} IS NOT NULL '
          'AND ${FilesDB.columnCollectionID} IS NOT -1) '
          'AND ${FilesDB.columnMMdVisibility} = ? '
          'ORDER BY ${FilesDB.columnCreationTime} DESC, '
          '${FilesDB.columnModificationTime} DESC';
      arguments = const [0, 3000000000000000, 0];
      convertInWorker = false;
    case _localFamily:
      query =
          'SELECT * FROM ${FilesDB.filesTable} '
          'WHERE ${FilesDB.columnCreationTime} >= ? '
          'AND ${FilesDB.columnCreationTime} <= ? '
          'AND (${FilesDB.columnMMdVisibility} IS NULL '
          'OR ${FilesDB.columnMMdVisibility} = ?) '
          'AND (${FilesDB.columnLocalID} IS NOT NULL OR '
          '(${FilesDB.columnCollectionID} IS NOT NULL '
          'AND ${FilesDB.columnCollectionID} IS NOT -1)) '
          'ORDER BY ${FilesDB.columnCreationTime} DESC, '
          '${FilesDB.columnModificationTime} DESC';
      arguments = const [0, 3000000000000000, 0];
      convertInWorker = false;
    default:
      fail('Unknown FILESDB_BENCHMARK_FAMILY: $family');
  }

  final transactionWatch = Stopwatch()..start();
  final queryWatch = Stopwatch()..start();
  late final List<Map<String, dynamic>> rows;
  try {
    rows = await database.readTransaction(
      (transaction) => transaction.getAll(query, arguments),
    );
  } finally {
    queryWatch.stop();
    transactionWatch.stop();
  }

  final conversionWatch = Stopwatch()..start();
  late final List<EnteFile> files;
  try {
    files = convertInWorker
        ? await Computer.shared().compute(
            _convertLegacyRows,
            param: {'result': rows},
            taskName: 'FilesDB.legacyBenchmark',
          )
        : FilesDB.instance.convertToFiles(rows);
  } finally {
    conversionWatch.stop();
  }

  final filterWatch = Stopwatch()..start();
  late final List<EnteFile> filteredFiles;
  try {
    filteredFiles = await applyDBFilters(
      files,
      DBFilterOptions(dedupeUploadID: false),
    );
  } finally {
    filterWatch.stop();
  }

  return {
    'pageCount': 1,
    'rawRows': rows.length,
    'finalRows': filteredFiles.length,
    'maxRawPage': rows.length,
    'queryMicros': queryWatch.elapsedMicroseconds,
    'maxQueryMicros': queryWatch.elapsedMicroseconds,
    'conversionMicros': conversionWatch.elapsedMicroseconds,
    'maxConversionMicros': conversionWatch.elapsedMicroseconds,
    'filterMicros': filterWatch.elapsedMicroseconds,
    'transactionMicros': transactionWatch.elapsedMicroseconds,
  };
}

Future<void> _writeQueryPlan(SqliteDatabase database, String family) async {
  final projection = FilesDB.materializedFileColumns.join(', ');
  late final String query;
  late final List<Object?> arguments;
  switch (family) {
    case _searchFamily:
      query =
          'EXPLAIN QUERY PLAN SELECT $projection '
          'FROM ${FilesDB.filesTable} '
          'WHERE (${FilesDB.columnCreationTime}, ${FilesDB.columnGeneratedID}) '
          '< (?, ?) '
          'ORDER BY ${FilesDB.columnCreationTime} DESC, '
          '${FilesDB.columnGeneratedID} DESC LIMIT ?';
      arguments = [2000000000000000, _fixtureRows, 2000];
    case _pendingFamily:
      query =
          'EXPLAIN QUERY PLAN SELECT $projection '
          'FROM ${FilesDB.filesTable} '
          'WHERE ${FilesDB.columnCreationTime} >= ? '
          'AND ${FilesDB.columnCreationTime} <= ? '
          'AND (${FilesDB.columnCollectionID} IS NOT NULL '
          'AND ${FilesDB.columnCollectionID} IS NOT -1) '
          'AND ${FilesDB.columnMMdVisibility} = ? '
          'AND (${FilesDB.columnCreationTime}, '
          '${FilesDB.columnModificationTime}, ${FilesDB.columnGeneratedID}) '
          '< (?, ?, ?) '
          'ORDER BY ${FilesDB.columnCreationTime} DESC, '
          '${FilesDB.columnModificationTime} DESC, '
          '${FilesDB.columnGeneratedID} DESC LIMIT ?';
      arguments = [
        0,
        3000000000000000,
        0,
        2000000000000000,
        2000000000000000,
        _fixtureRows,
        2000,
      ];
    case _localFamily:
      query =
          'EXPLAIN QUERY PLAN SELECT $projection '
          'FROM ${FilesDB.filesTable} '
          'WHERE ${FilesDB.columnCreationTime} >= ? '
          'AND ${FilesDB.columnCreationTime} <= ? '
          'AND (${FilesDB.columnMMdVisibility} IS NULL '
          'OR ${FilesDB.columnMMdVisibility} = ?) '
          'AND (${FilesDB.columnLocalID} IS NOT NULL OR '
          '(${FilesDB.columnCollectionID} IS NOT NULL '
          'AND ${FilesDB.columnCollectionID} IS NOT -1)) '
          'AND (${FilesDB.columnCreationTime}, '
          '${FilesDB.columnModificationTime}, ${FilesDB.columnGeneratedID}) '
          '< (?, ?, ?) '
          'ORDER BY ${FilesDB.columnCreationTime} DESC, '
          '${FilesDB.columnModificationTime} DESC, '
          '${FilesDB.columnGeneratedID} DESC LIMIT ?';
      arguments = [
        0,
        3000000000000000,
        0,
        2000000000000000,
        2000000000000000,
        _fixtureRows,
        2000,
      ];
    default:
      fail('Unknown FILESDB_BENCHMARK_FAMILY: $family');
  }
  final rows = await database.getAll(query, arguments);
  stdout.writeln(
    '$_marker${jsonEncode({'event': 'queryPlan', 'family': family, 'details': rows.map((row) => row['detail']).toList()})}',
  );
}

Map<String, Object?> _fixtureValues({
  required int id,
  required int creationTime,
  required int modificationTime,
}) {
  const cryptoValue =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const headerValue =
      'header-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      '0123456789abcdef0123456789abcdef';
  const exifValue =
      '{"Make":"Deterministic","Model":"Benchmark","payload":"'
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}';
  return {
    FilesDB.columnGeneratedID: id,
    FilesDB.columnLocalID: id % 10 == 0 ? 'local-$id' : null,
    FilesDB.columnUploadedFileID: id,
    FilesDB.columnOwnerID: id.isEven ? 1 : 2,
    FilesDB.columnCollectionID: 100 + (id % 997),
    FilesDB.columnTitle: 'deterministic-$id.jpg',
    FilesDB.columnDeviceFolder: id % 3 == 0 ? 'camera' : null,
    FilesDB.columnLatitude: id % 17 == 0 ? 12.25 : null,
    FilesDB.columnLongitude: id % 17 == 0 ? 77.75 : null,
    FilesDB.columnFileType: id % 8 == 0 ? 1 : 0,
    FilesDB.columnModificationTime: modificationTime,
    FilesDB.columnEncryptedKey: cryptoValue,
    FilesDB.columnKeyDecryptionNonce: cryptoValue,
    FilesDB.columnFileDecryptionHeader: headerValue,
    FilesDB.columnThumbnailDecryptionHeader: headerValue,
    FilesDB.columnMetadataDecryptionHeader: headerValue,
    FilesDB.columnCreationTime: creationTime,
    FilesDB.columnUpdationTime: creationTime + 1,
    FilesDB.columnFileSubType: 0,
    FilesDB.columnDuration: id % 8 == 0 ? 12000 : 0,
    FilesDB.columnExif: exifValue,
    FilesDB.columnHash: 'hash-${id % 99991}',
    FilesDB.columnMetadataVersion: 3,
    FilesDB.columnMMdEncodedJson: '{"visibility":0}',
    FilesDB.columnMMdVersion: 1,
    FilesDB.columnMMdVisibility: 0,
    FilesDB.columnPubMMdEncodedJson:
        '{"caption":"benchmark","w":4032,"h":3024}',
    FilesDB.columnPubMMdVersion: 1,
    FilesDB.columnFileSize: 1000000 + id,
    FilesDB.columnAddedTime: creationTime + 2,
  };
}

List<EnteFile> _convertLegacyRows(Map<dynamic, dynamic> arguments) =>
    FilesDB.instance.convertToFilesForIsolate(arguments);
