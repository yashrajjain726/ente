import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photos/db/common/base.dart';
import 'package:photos/db/common/conflict_algo.dart';
import 'package:sqlite_async/sqlite_async.dart';

class FileUpdationDB with SqlDbBase {
  static const _databaseName = "ente.files_migration.db";
  static final Logger _logger = Logger((FileUpdationDB).toString());

  static const tableName = 're_upload_tracker';
  static const columnLocalID = 'local_id';
  static const columnReason = 'reason';
  static const androidMissingGPS = 'androidMissingGPS';

  static const modificationTimeUpdated = 'modificationTimeUpdated';

  static List<String> _createTable() {
    return [
      '''
      CREATE TABLE $tableName (
      $columnLocalID TEXT NOT NULL,
      UNIQUE($columnLocalID)
      ); 
      ''',
    ];
  }

  static List<String> addReasonColumn() {
    return [
      '''
        ALTER TABLE $tableName ADD COLUMN $columnReason TEXT;
      ''',
      '''
        UPDATE $tableName SET $columnReason = '$modificationTimeUpdated';
      ''',
    ];
  }

  static final initializationScript = [..._createTable()];
  static final migrationScripts = [...addReasonColumn()];
  FileUpdationDB._privateConstructor();

  static final FileUpdationDB instance = FileUpdationDB._privateConstructor();

  static Future<SqliteDatabase>? _dbFuture;

  Future<SqliteDatabase> get database async {
    _dbFuture ??= _initDatabase();
    return _dbFuture!;
  }

  Future<SqliteDatabase> _initDatabase() async {
    final Directory documentsDirectory =
        await getApplicationDocumentsDirectory();
    final String path = join(documentsDirectory.path, _databaseName);
    debugPrint("DB path " + path);
    final database = SqliteDatabase(path: path);
    await migrate(database, [...initializationScript, ...migrationScripts]);
    return database;
  }

  Future<void> clearTable() async {
    final db = await instance.database;
    await db.delete(tableName);
  }

  Future<void> insertMultiple(List<String> fileLocalIDs, String reason) async {
    final startTime = DateTime.now();
    final db = await instance.database;
    var batch = db.batch();
    int batchCounter = 0;
    for (String localID in fileLocalIDs) {
      if (batchCounter == 400) {
        await batch.commit(noResult: true);
        batch = db.batch();
        batchCounter = 0;
      }
      batch.insert(
        tableName,
        _getRowForReUploadTable(localID, reason),
        conflictAlgorithm: SqliteAsyncConflictAlgorithm.replace,
      );
      batchCounter++;
    }
    await batch.commit(noResult: true);
    final endTime = DateTime.now();
    final duration = Duration(
      microseconds:
          endTime.microsecondsSinceEpoch - startTime.microsecondsSinceEpoch,
    );
    _logger.info(
      "Batch insert of ${fileLocalIDs.length} updated files due to $reason "
      "took ${duration.inMilliseconds} ms.",
    );
  }

  Future<void> deleteByLocalIDs(List<String> localIDs, String reason) async {
    if (localIDs.isEmpty) {
      return;
    }
    final db = await instance.database;
    await db.executeBatch(
      '''
      DELETE FROM $tableName
      WHERE $columnLocalID = ? AND $columnReason = ?;
    ''',
      [
        for (final localID in localIDs) [localID, reason],
      ],
    );
  }

  Future<bool> isExisting(String localID, String reason) async {
    final db = await instance.database;
    final rows = await db.query(
      tableName,
      where: '$columnLocalID = ? AND $columnReason = ?',
      whereArgs: [localID, reason],
    );
    return rows.isNotEmpty;
  }

  Future<List<String>> getLocalIDsForPotentialReUpload(
    int limit,
    String reason,
  ) async {
    final db = await instance.database;
    final rows = await db.query(
      tableName,
      limit: limit,
      where: '$columnReason = ?',
      whereArgs: [reason],
    );
    final result = <String>[];
    for (final row in rows) {
      result.add(row[columnLocalID] as String);
    }
    return result;
  }

  Future<void> deleteByReasons(List<String> reasons) async {
    if (reasons.isEmpty) {
      return;
    }
    final db = await instance.database;
    await db.executeBatch(
      '''
      DELETE FROM $tableName
      WHERE $columnReason = ?;
    ''',
      [
        for (final reason in reasons) [reason],
      ],
    );
  }

  Map<String, dynamic> _getRowForReUploadTable(String localID, String reason) {
    final row = <String, dynamic>{};
    row[columnLocalID] = localID;
    row[columnReason] = reason;
    return row;
  }
}
