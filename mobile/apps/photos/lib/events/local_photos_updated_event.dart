import 'package:photos/events/files_updated_event.dart';

class LocalPhotosUpdatedEvent extends FilesUpdatedEvent {
  // "Recent" means created within the last seven days.
  final bool hasRecentNewLocalDiscovery;

  LocalPhotosUpdatedEvent(
    super.updatedFiles, {
    type,
    required source,
    this.hasRecentNewLocalDiscovery = false,
  }) : super(type: type ?? EventType.addedOrUpdated, source: source ?? "");
}
