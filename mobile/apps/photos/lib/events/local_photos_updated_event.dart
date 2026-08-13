import 'package:photos/events/files_updated_event.dart';
import 'package:photos/models/file/file.dart';

class LocalPhotosUpdatedEvent extends FilesUpdatedEvent {
  final List<EnteFile> newlyDiscoveredFiles;
  final bool canAddNewFilesWithoutReload;

  bool get hasRecentNewLocalDiscovery {
    final sevenDaysAgo = DateTime.now()
        .subtract(const Duration(days: 7))
        .microsecondsSinceEpoch;
    return newlyDiscoveredFiles.any(
      (file) => (file.creationTime ?? 0) > sevenDaysAgo,
    );
  }

  LocalPhotosUpdatedEvent(
    super.updatedFiles, {
    type,
    required source,
    List<EnteFile> newlyDiscoveredFiles = const [],
    this.canAddNewFilesWithoutReload = false,
  }) : newlyDiscoveredFiles = List.unmodifiable(newlyDiscoveredFiles),
       super(type: type ?? EventType.addedOrUpdated, source: source ?? "");
}
