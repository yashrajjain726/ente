import "package:flutter_test/flutter_test.dart";
import "package:photos/models/memories/memory_music_track.dart";
import "package:photos/services/memories/memory_music_selector.dart";

void main() {
  const tracks = <MemoryMusicTrack>[
    MemoryMusicTrack(
      id: "track-1",
      source: AssetMemoryMusicSource("assets/track-1.mp3"),
    ),
    MemoryMusicTrack(
      id: "track-2",
      source: AssetMemoryMusicSource("assets/track-2.mp3"),
    ),
    MemoryMusicTrack(
      id: "track-3",
      source: AssetMemoryMusicSource("assets/track-3.mp3"),
    ),
  ];
  const memoryIDs = <String>["memory-a", "memory-b", "memory-c", "memory-d"];

  test("assignments are deterministic", () {
    final first = assignMemoryMusicTracks(memoryIDs: memoryIDs, tracks: tracks);
    final second = assignMemoryMusicTracks(
      memoryIDs: memoryIDs,
      tracks: tracks,
    );

    expect(second, first);
  });

  test("adjacent memories do not receive the same track", () {
    final assignments = assignMemoryMusicTracks(
      memoryIDs: memoryIDs,
      tracks: tracks,
    );
    final assignedTracks = memoryIDs
        .map((memoryID) => assignments[memoryID])
        .toList();

    for (var index = 1; index < assignedTracks.length; index++) {
      expect(assignedTracks[index], isNot(assignedTracks[index - 1]));
    }
  });

  test("one-track catalog reuses its only track", () {
    final assignments = assignMemoryMusicTracks(
      memoryIDs: memoryIDs,
      tracks: const <MemoryMusicTrack>[
        MemoryMusicTrack(
          id: "track-1",
          source: AssetMemoryMusicSource("assets/track-1.mp3"),
        ),
      ],
    );

    expect(assignments.values, everyElement("track-1"));
  });

  test("empty catalog produces no assignments", () {
    expect(
      assignMemoryMusicTracks(
        memoryIDs: memoryIDs,
        tracks: const <MemoryMusicTrack>[],
      ),
      isEmpty,
    );
  });
}
