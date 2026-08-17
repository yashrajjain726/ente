import "package:photos/models/memories/memory_music_track.dart";

class MemoryMusicCatalog {
  final List<MemoryMusicTrack> tracks;
  final Map<String, MemoryMusicTrack> _tracksByID =
      <String, MemoryMusicTrack>{};

  MemoryMusicCatalog(Iterable<MemoryMusicTrack> inputTracks)
    : tracks = List.unmodifiable(inputTracks) {
    for (final track in tracks) {
      if (track.id.isEmpty) {
        throw ArgumentError.value(track.id, "track.id", "Must not be empty");
      }
      if (_tracksByID.containsKey(track.id)) {
        throw ArgumentError.value(
          track.id,
          "track.id",
          "Memory music track IDs must be unique",
        );
      }
      _tracksByID[track.id] = track;
    }
  }

  MemoryMusicTrack? trackForID(String id) => _tracksByID[id];

  static final MemoryMusicCatalog bundled =
      MemoryMusicCatalog(const <MemoryMusicTrack>[
        MemoryMusicTrack(
          id: "puddles-instrumental-segment-1",
          source: AssetMemoryMusicSource(
            "assets/memory-music/puddles-instrumental-01.mp3",
          ),
          title: "Puddles (Zero 7 Remix)",
          artist: "Not for Radio",
        ),
        MemoryMusicTrack(
          id: "puddles-instrumental-segment-2",
          source: AssetMemoryMusicSource(
            "assets/memory-music/puddles-instrumental-02.mp3",
          ),
          title: "Puddles (Zero 7 Remix)",
          artist: "Not for Radio",
        ),
        MemoryMusicTrack(
          id: "puddles-instrumental-segment-3",
          source: AssetMemoryMusicSource(
            "assets/memory-music/puddles-instrumental-03.mp3",
          ),
          title: "Puddles (Zero 7 Remix)",
          artist: "Not for Radio",
        ),
      ]);
}
