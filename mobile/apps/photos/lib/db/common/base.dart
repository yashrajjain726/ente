import "package:flutter/foundation.dart";
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
    final toVersion = migrationScripts.length;
    final probe = await database.writeLock(
      (tx) => tx.get('PRAGMA user_version'),
    );
    final probedVersion = probe['user_version'] as int;

    if (probedVersion > toVersion) {
      throw AssertionError(
        "currentVersion($probedVersion) cannot be greater than toVersion($toVersion)",
      );
    }
    if (probedVersion == toVersion) {
      return;
    }

    final didMigrate = await database.writeTransaction((tx) async {
      final result = await tx.get('PRAGMA user_version');
      final currentVersion = result['user_version'] as int;

      if (currentVersion > toVersion) {
        throw AssertionError(
          "currentVersion($currentVersion) cannot be greater than toVersion($toVersion)",
        );
      }
      if (currentVersion == toVersion) {
        return false;
      }

      debugPrint(
        "$runtimeType migrating database from $currentVersion to $toVersion",
      );
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
      return true;
    });

    if (didMigrate) {
      await database.refreshSchema();
    }
  }
}

Future<void> Function(CommonDatabase) _scriptExecutor(String script) {
  return (database) async {
    database.execute(script);
  };
}
