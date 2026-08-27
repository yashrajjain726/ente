import "package:flutter/foundation.dart";
import "package:photos/db/common/conflict_algo.dart";
import "package:sqlite_async/sqlite3_common.dart";
import "package:sqlite_async/sqlite_async.dart";

mixin SqlDbBase {
  static final Map<int, String> _params = <int, String>{};

  static String getParams(int count) {
    if (count <= 0) {
      throw ArgumentError.value(count, "count", "must be greater than 0");
    }
    return _params.putIfAbsent(count, () => List.filled(count, "?").join(", "));
  }

  Future<void> migrate(
    SqliteDatabase database,
    List<String> migrationScripts,
  ) async {
    final result = await database.execute('PRAGMA user_version');
    final currentVersion = result.first['user_version'] as int;
    final toVersion = migrationScripts.length;

    if (currentVersion < toVersion) {
      debugPrint(
        "$runtimeType migrating database from $currentVersion to $toVersion",
      );
      await database.writeTransaction((tx) async {
        for (int i = currentVersion + 1; i <= toVersion; i++) {
          try {
            final script = migrationScripts[i - 1];
            await tx.computeWithDatabase(_scriptExecutor(script));
          } catch (e) {
            debugPrint(
              "$runtimeType Error running migration script index ${i - 1} $e",
            );
            rethrow;
          }
        }
        await tx.execute('PRAGMA user_version = $toVersion');
      });
      await database.refreshSchema();
    } else if (currentVersion > toVersion) {
      throw AssertionError(
        "currentVersion($currentVersion) cannot be greater than toVersion($toVersion)",
      );
    }
  }
}

Future<void> Function(CommonDatabase) _scriptExecutor(String script) {
  return (database) async {
    database.execute(script);
  };
}

extension SqliteAsyncConvenience on SqliteDatabase {
  Future<List<Map<String, dynamic>>> query(
    String table, {
    List<String>? columns,
    String? where,
    List<Object?>? whereArgs,
    String? orderBy,
    int? limit,
    int? offset,
  }) async {
    final query = StringBuffer('SELECT ${columns?.join(', ') ?? '*'} ')
      ..write('FROM $table');
    final parameters = <Object?>[...?whereArgs];
    if (where != null) {
      query.write(' WHERE $where');
    }
    if (orderBy != null) {
      query.write(' ORDER BY $orderBy');
    }
    if (limit != null) {
      query.write(' LIMIT ?');
      parameters.add(limit);
    } else if (offset != null) {
      query.write(' LIMIT -1');
    }
    if (offset != null) {
      query.write(' OFFSET ?');
      parameters.add(offset);
    }
    return _toMaps(await getAll(query.toString(), parameters));
  }

  Future<List<Map<String, dynamic>>> rawQuery(
    String sql, [
    List<Object?> parameters = const [],
  ]) async {
    return _toMaps(await getAll(sql, parameters));
  }

  Future<int> insert(
    String table,
    Map<String, Object?> values, {
    SqliteAsyncConflictAlgorithm? conflictAlgorithm,
  }) {
    final statement = _insertStatement(table, values, conflictAlgorithm);
    return writeTransaction((tx) async {
      await tx.execute(statement.sql, statement.parameters);
      final row = await tx.get('SELECT last_insert_rowid() AS id');
      return row['id'] as int;
    });
  }

  Future<int> update(
    String table,
    Map<String, Object?> values, {
    String? where,
    List<Object?>? whereArgs,
  }) {
    final assignments = values.keys.map((column) => '$column = ?').join(', ');
    final sql = StringBuffer('UPDATE $table SET $assignments');
    if (where != null) {
      sql.write(' WHERE $where');
    }
    return _executeAndGetChangeCount(sql.toString(), [
      ...values.values,
      ...?whereArgs,
    ]);
  }

  Future<int> delete(String table, {String? where, List<Object?>? whereArgs}) {
    final sql = StringBuffer('DELETE FROM $table');
    if (where != null) {
      sql.write(' WHERE $where');
    }
    return _executeAndGetChangeCount(sql.toString(), [...?whereArgs]);
  }

  Future<int> rawUpdate(String sql, [List<Object?> parameters = const []]) {
    return _executeAndGetChangeCount(sql, parameters);
  }

  SqliteAsyncBatch batch() => SqliteAsyncBatch(this);

  Future<int> _executeAndGetChangeCount(String sql, List<Object?> parameters) {
    return writeTransaction((tx) async {
      await tx.execute(sql, parameters);
      final row = await tx.get('SELECT changes() AS count');
      return row['count'] as int;
    });
  }
}

class SqliteAsyncBatch {
  SqliteAsyncBatch(this._database);

  final SqliteDatabase _database;
  final List<({String sql, List<Object?> parameters})> _statements = [];

  void insert(
    String table,
    Map<String, Object?> values, {
    SqliteAsyncConflictAlgorithm? conflictAlgorithm,
  }) {
    _statements.add(_insertStatement(table, values, conflictAlgorithm));
  }

  void rawDelete(String sql, [List<Object?> parameters = const []]) {
    _statements.add((sql: sql, parameters: parameters));
  }

  Future<void> commit({bool noResult = false}) {
    return _database.writeTransaction((tx) async {
      for (final statement in _statements) {
        await tx.execute(statement.sql, statement.parameters);
      }
    });
  }
}

({String sql, List<Object?> parameters}) _insertStatement(
  String table,
  Map<String, Object?> values,
  SqliteAsyncConflictAlgorithm? conflictAlgorithm,
) {
  final conflict = conflictAlgorithm == null
      ? ''
      : ' OR ${conflictAlgorithm.name.toUpperCase()}';
  final columns = values.keys.join(', ');
  final placeholders = List.filled(values.length, '?').join(', ');
  return (
    sql: 'INSERT$conflict INTO $table ($columns) VALUES ($placeholders)',
    parameters: values.values.toList(growable: false),
  );
}

List<Map<String, dynamic>> _toMaps(Iterable<Map<String, Object?>> rows) {
  return rows.map(Map<String, dynamic>.from).toList(growable: false);
}
