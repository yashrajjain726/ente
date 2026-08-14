import 'package:photos/models/file/file.dart';

sealed class TrashFile extends EnteFile {
  TrashFile();

  TrashFile.from(super.file, {required this.deleteBy}) : super.from();

  late int deleteBy;
}

class EnteTrashFile extends TrashFile {
  EnteTrashFile();

  EnteTrashFile.from(
    super.file, {
    required super.deleteBy,
    required this.createdAt,
    required this.updateAt,
  }) : super.from();

  late int createdAt;

  late int updateAt;
}

class DeviceTrashFile extends TrashFile {
  DeviceTrashFile();
}
