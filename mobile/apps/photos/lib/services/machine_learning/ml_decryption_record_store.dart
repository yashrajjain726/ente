import "package:logging/logging.dart";
import "package:shared_preferences/shared_preferences.dart";
import "package:synchronized/synchronized.dart";

class MlDecryptionRecordStore {
  static const _preferenceKey = "ml_decryption_record_file_ids";

  final SharedPreferences _preferences;
  final Lock _lock = Lock();
  final Logger _logger = Logger("MlDecryptionRecordStore");

  MlDecryptionRecordStore(this._preferences);

  List<int> get fileIDs {
    final result = <int>{};
    for (final value
        in _preferences.getStringList(_preferenceKey) ?? const []) {
      final fileID = int.tryParse(value);
      if (fileID != null) {
        result.add(fileID);
      }
    }
    return result.toList()..sort();
  }

  int get count => fileIDs.length;

  Future<void> add(int fileID) async {
    await _lock.synchronized(() async {
      final updatedFileIDs = fileIDs.toSet();
      if (!updatedFileIDs.add(fileID)) {
        return;
      }
      final values = updatedFileIDs.toList()..sort();
      try {
        final stored = await _preferences.setStringList(
          _preferenceKey,
          values.map((id) => id.toString()).toList(),
        );
        if (!stored) {
          _logger.warning(
            "Failed to store ML decryption record for fileID $fileID",
          );
        }
      } catch (error, stackTrace) {
        _logger.warning(
          "Failed to store ML decryption record for fileID $fileID",
          error,
          stackTrace,
        );
      }
    });
  }

  void logFileIDs() {
    _logger.info("ML decryption record fileIDs: $fileIDs");
  }
}
