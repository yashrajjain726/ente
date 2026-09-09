import "package:logging/logging.dart";
import "package:photos/db/ml/base.dart";
import "package:photos/db/ml/dart_db.dart";
import "package:photos/db/ml/rust_db.dart";
import "package:photos/service_locator.dart";
import "package:photos/src/rust/api/ml_db_api.dart" show decideMlDbBackend;

class MLDataDB {
  MLDataDB._();

  static final Logger _logger = Logger("MLDataDB");
  static final bool _useRust = _decideBackend();

  static final IMLDataDB<int> instance = _useRust
      ? RustMLDataDB.instance
      : DartMLDataDB.instance;
  static final IMLDataDB<int> localGalleryInstance = _useRust
      ? RustMLDataDB.localGalleryInstance
      : DartMLDataDB.localGalleryInstance;

  static bool get isRustBackend => _useRust;

  static bool _decideBackend() {
    final wantsRust = flagService.rustMlDb || localSettings.rustMlDbOverride;
    final useRust = decideMlDbBackend(preferRust: wantsRust);
    _logger.info(
      "ML DB backend: ${useRust ? "rust" : "dart"} (wantsRust: $wantsRust)",
    );
    return useRust;
  }
}
