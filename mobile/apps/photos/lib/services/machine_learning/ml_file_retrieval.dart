import "dart:io";

import "package:photos/module/download/decrypt.dart";
import "package:photos/services/machine_learning/ml_exceptions.dart";

typedef MlFileLoader = Future<File?> Function();

Future<File?> loadFileForMlWithDecryptionRetry(MlFileLoader load) async {
  late final DownloadDecryptionError firstFailure;
  try {
    return await load();
  } on DownloadDecryptionError catch (error) {
    firstFailure = error;
  }

  try {
    return await load();
  } on DownloadDecryptionError catch (error) {
    if (error.encryptedFileSha1 == firstFailure.encryptedFileSha1) {
      throw RepeatedFileDecryptionError();
    }
    rethrow;
  }
}
