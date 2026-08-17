import "package:flutter_test/flutter_test.dart";
import "package:photos/models/memories/memory_music_track.dart";
import "package:photos/services/memories/memory_music_catalog.dart";
import "package:photos/services/memories/memory_music_controller.dart";
import "package:photos/services/memories/memory_music_source_loader.dart";

void main() {
  late _FakeMemoryMusicPlayer player;
  late List<bool> persistedMuteValues;
  late MemoryMusicController controller;

  setUp(() {
    player = _FakeMemoryMusicPlayer();
    persistedMuteValues = <bool>[];
    controller = MemoryMusicController(
      catalog: MemoryMusicCatalog(const <MemoryMusicTrack>[
        MemoryMusicTrack(
          id: "track-1",
          source: AssetMemoryMusicSource("assets/track-1.mp3"),
        ),
        MemoryMusicTrack(
          id: "track-2",
          source: AssetMemoryMusicSource("assets/track-2.mp3"),
        ),
      ]),
      assignments: const <String, String>{
        "memory-1": "track-1",
        "memory-2": "track-2",
      },
      initiallyMuted: false,
      persistMuted: (value) async => persistedMuteValues.add(value),
      player: player,
    );
  });

  tearDown(() {
    controller.dispose();
  });

  test("activating a photo memory loads, loops, and plays its track", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    expect(player.loadedAssets, <String>["assets/track-1.mp3"]);
    expect(player.looping, isTrue);
    expect(player.position, Duration.zero);
    expect(player.playing, isTrue);
    expect(player.volume, 1.0);
  });

  test("video items pause music and photos resume it", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    await controller.setCurrentItem(memoryID: "memory-1", isVideo: true);
    expect(player.playing, isFalse);

    await controller.setCurrentItem(memoryID: "memory-1", isVideo: false);
    expect(player.playing, isTrue);
  });

  test("item reports from inactive memories are ignored", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    await controller.setCurrentItem(memoryID: "memory-2", isVideo: true);

    expect(player.playing, isTrue);
  });

  test("mute persists and changes volume without pausing", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    await controller.setMuted(true);
    expect(player.playing, isTrue);
    expect(player.volume, 0.0);
    expect(persistedMuteValues, <bool>[true]);

    await controller.setMuted(false);
    expect(player.playing, isTrue);
    expect(player.volume, 1.0);
    expect(persistedMuteValues, <bool>[true, false]);
  });

  test("changing memories restarts the assigned track", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);
    player.position = const Duration(seconds: 4);

    await controller.activateMemory("memory-2", currentItemIsVideo: false);

    expect(player.loadedAssets.last, "assets/track-2.mp3");
    expect(player.position, Duration.zero);
  });
}

class _FakeMemoryMusicPlayer implements MemoryMusicPlayer {
  final List<String> loadedAssets = <String>[];
  bool looping = false;
  bool playing = false;
  double volume = 1.0;
  Duration position = Duration.zero;

  @override
  Future<void> configureAudioSession() async {}

  @override
  Future<void> loadAsset(String assetPath) async {
    loadedAssets.add(assetPath);
    position = Duration.zero;
  }

  @override
  Future<void> setLooping() async {
    looping = true;
  }

  @override
  Future<void> setVolume(double value) async {
    volume = value;
  }

  @override
  Future<void> play() async {
    playing = true;
  }

  @override
  Future<void> pause() async {
    playing = false;
  }

  @override
  Future<void> stop() async {
    playing = false;
  }

  @override
  Future<void> dispose() async {}
}
