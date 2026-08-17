import "dart:convert";

import "package:crypto/crypto.dart";
import "package:photos/models/memories/memory_music_track.dart";

Map<String, String> assignMemoryMusicTracks({
  required Iterable<String> memoryIDs,
  required List<MemoryMusicTrack> tracks,
}) {
  if (tracks.isEmpty) return const <String, String>{};

  final assignments = <String, String>{};
  String? previousTrackID;
  for (final memoryID in memoryIDs) {
    var trackIndex = _stableTrackIndex(memoryID, tracks.length);
    if (tracks.length > 1 && tracks[trackIndex].id == previousTrackID) {
      trackIndex = (trackIndex + 1) % tracks.length;
    }
    final trackID = tracks[trackIndex].id;
    assignments[memoryID] = trackID;
    previousTrackID = trackID;
  }
  return Map.unmodifiable(assignments);
}

int _stableTrackIndex(String memoryID, int trackCount) {
  return sha256.convert(utf8.encode(memoryID)).bytes.first % trackCount;
}
