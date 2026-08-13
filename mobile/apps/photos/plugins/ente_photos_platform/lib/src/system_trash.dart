import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class SystemTrashFile {
  const SystemTrashFile({
    required this.localID,
    required this.deleteBy,
    required this.deviceFolder,
  });

  factory SystemTrashFile.fromMap(Map<dynamic, dynamic> map) {
    return SystemTrashFile(
      localID: _requiredInt(map['localID'], 'localID'),
      deleteBy: _requiredInt(map['deleteBy'], 'deleteBy'),
      deviceFolder: _requiredString(map['deviceFolder'], 'deviceFolder'),
    );
  }

  final int localID;
  final int deleteBy;
  final String deviceFolder;
}

abstract interface class SystemTrashSource {
  Future<List<SystemTrashFile>> getFiles();
}

class SystemTrashClient implements SystemTrashSource {
  SystemTrashClient({MethodChannel? methodChannel, TargetPlatform? platform})
    : _methodChannel =
          methodChannel ?? const MethodChannel('io.ente.photos.platform'),
      _platform = platform ?? defaultTargetPlatform;

  static final instance = SystemTrashClient();

  final MethodChannel _methodChannel;
  final TargetPlatform _platform;

  @override
  Future<List<SystemTrashFile>> getFiles() async {
    if (_platform != TargetPlatform.android) return const [];

    final result =
        await _methodChannel.invokeListMethod<Object?>(
          'systemTrash.getFiles',
        ) ??
        const [];
    return result.map((file) {
      if (file is! Map<dynamic, dynamic>) {
        throw const FormatException('System trash file is not a map');
      }
      return SystemTrashFile.fromMap(file);
    }).toList();
  }
}

int _requiredInt(Object? value, String name) {
  if (value is! int) throw FormatException('$name must be an integer');
  return value;
}

String _requiredString(Object? value, String name) {
  if (value is! String || value.isEmpty) {
    throw FormatException('$name must be a non-empty string');
  }
  return value;
}
