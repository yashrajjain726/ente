import "package:flutter_test/flutter_test.dart";
import "package:photos/models/memories/memory_music_track.dart";
import "package:photos/services/memories/memory_music_catalog.dart";

void main() {
  test("catalog looks up tracks by their stable IDs", () {
    const track = MemoryMusicTrack(
      id: "track-1",
      source: AssetMemoryMusicSource("assets/track-1.mp3"),
    );
    final catalog = MemoryMusicCatalog(const <MemoryMusicTrack>[track]);

    expect(catalog.trackForID("track-1"), same(track));
    expect(catalog.trackForID("missing"), isNull);
  });

  test("catalog rejects duplicate track IDs", () {
    expect(
      () => MemoryMusicCatalog(const <MemoryMusicTrack>[
        MemoryMusicTrack(
          id: "duplicate",
          source: AssetMemoryMusicSource("assets/track-1.mp3"),
        ),
        MemoryMusicTrack(
          id: "duplicate",
          source: AssetMemoryMusicSource("assets/track-2.mp3"),
        ),
      ]),
      throwsArgumentError,
    );
  });
}
