import 'dart:io';

import 'package:flutter/services.dart';

class DeviceTrashFile {
  const DeviceTrashFile({
    required this.localID,
    required this.deleteBy,
    required this.deviceFolder,
  });

  factory DeviceTrashFile.fromMap(Map<dynamic, dynamic> map) => DeviceTrashFile(
    localID: map['localID'],
    deleteBy: map['deleteBy'],
    deviceFolder: map['deviceFolder'],
  );

  final int localID;

  /// The absolute deletion deadline in microseconds since the Unix epoch.
  final int deleteBy;

  final String deviceFolder;
}

abstract interface class DeviceTrashSource {
  Future<List<DeviceTrashFile>> getFiles();
}

class DeviceTrashClient implements DeviceTrashSource {
  DeviceTrashClient({MethodChannel? methodChannel})
    : _methodChannel = methodChannel ?? const MethodChannel(_methodChannelName);

  static final instance = DeviceTrashClient();
  static const _methodChannelName = 'io.ente.photos.platform';

  final MethodChannel _methodChannel;

  @override
  Future<List<DeviceTrashFile>> getFiles() async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('Device trash is only supported on Android');
    }
    final result = await _methodChannel.invokeListMethod<Map<dynamic, dynamic>>(
      'deviceTrash.getFiles',
    );
    return List.unmodifiable(result!.map(DeviceTrashFile.fromMap));
  }
}
