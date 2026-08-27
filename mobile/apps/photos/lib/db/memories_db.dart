import 'dart:async';
import 'dart:io';

import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photos/db/common/base.dart';
import 'package:photos/models/memories/memory.dart';
import 'package:sqlite_async/sqlite_async.dart';

class MemoriesDB with SqlDbBase {
  static const _databaseName = "ente.memories.db";

  static const table = 'memories';

  static const columnFileID = 'file_id';
  static const columnSeenTime = 'seen_time';

  final String _dbName;

  MemoriesDB._privateConstructor({String dbName = _databaseName})
    : _dbName = dbName;
  static final MemoriesDB instance = MemoriesDB._privateConstructor();
  static final MemoriesDB localGalleryInstance = MemoriesDB._privateConstructor(
    dbName: "ente.memories.offline.db",
  );

  Future<SqliteDatabase>? _dbFuture;
  Future<SqliteDatabase> get database async {
    final databaseFuture = _dbFuture ??= _initDatabase();
    try {
      return await databaseFuture;
    } catch (_) {
      if (identical(_dbFuture, databaseFuture)) {
        _dbFuture = null;
      }
      rethrow;
    }
  }

  Future<SqliteDatabase> _initDatabase() async {
    final Directory documentsDirectory =
        await getApplicationDocumentsDirectory();
    final String path = join(documentsDirectory.path, _dbName);
    final database = SqliteDatabase(path: path);
    try {
      await migrate(database, [
        '''
                CREATE TABLE $table (
                  $columnFileID INTEGER PRIMARY KEY NOT NULL,
                  $columnSeenTime TEXT NOT NULL
                )
                ''',
      ]);
      return database;
    } catch (_) {
      await database.close();
      rethrow;
    }
  }

  Future<void> clearTable() async {
    final db = await database;
    await db.execute('DELETE FROM $table');
  }

  Future<int> clearMemoriesSeenBeforeTime(int timestamp) async {
    final db = await database;
    final rows = await db.execute(
      'DELETE FROM $table WHERE $columnSeenTime < ? RETURNING $columnFileID',
      [timestamp],
    );
    return rows.length;
  }

  Future<int> markMemoryAsSeen(
    Memory memory,
    int timestamp, {
    int? seenTimeKey,
  }) async {
    final db = await database;
    final rows = await db.execute(
      '''
      INSERT OR REPLACE INTO $table ($columnFileID, $columnSeenTime)
      VALUES (?, ?)
      RETURNING $columnFileID
      ''',
      [seenTimeKey ?? memory.file.generatedID, timestamp],
    );
    return rows.first[columnFileID] as int;
  }

  Future<Map<int, int>> getSeenTimes() async {
    final db = await database;
    return _convertToSeenTimes(await db.getAll('SELECT * FROM $table'));
  }

  Map<int, int> _convertToSeenTimes(List<Map<String, dynamic>> rows) {
    final seenTimes = <int, int>{};
    for (final row in rows) {
      seenTimes[row[columnFileID]] = int.parse(row[columnSeenTime]);
    }
    return seenTimes;
  }
}
