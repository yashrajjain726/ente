import "package:flutter_test/flutter_test.dart";
import "package:photos/models/memories/memory_music_track.dart";
import "package:photos/services/memories/memory_music_controller.dart";
import "package:photos/services/memories/memory_music_player.dart";

void main() {
  late _FakeMemoryMusicPlayer player;
  late List<bool> persistedMuteValues;
  late MemoryMusicController controller;

  setUp(() {
    player = _FakeMemoryMusicPlayer();
    persistedMuteValues = <bool>[];
    controller = MemoryMusicController(
      assignments: const <String, MemoryMusicTrack>{
        "memory-1": MemoryMusicTrack(
          id: "track-1",
          assetPath: "assets/track-1.mp3",
        ),
        "memory-2": MemoryMusicTrack(
          id: "track-2",
          assetPath: "assets/track-2.mp3",
        ),
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

    await controller.activateMemory("memory-1", currentItemIsVideo: true);
    expect(player.playing, isFalse);

    await controller.activateMemory("memory-1", currentItemIsVideo: true);
    expect(player.playing, isFalse);

    await controller.activateMemory("memory-1", currentItemIsVideo: false);
    expect(player.playing, isTrue);
    expect(player.loadAttempts, 1);
  });

  test("mute persists and changes volume without pausing", () async {
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    await controller.toggleMuted();
    expect(player.playing, isTrue);
    expect(player.volume, 0.0);
    expect(persistedMuteValues, <bool>[true]);

    await controller.toggleMuted();
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

  test("a failed track load can be retried", () async {
    player.failNextLoad = true;

    await controller.activateMemory("memory-1", currentItemIsVideo: false);
    await controller.activateMemory("memory-1", currentItemIsVideo: false);

    expect(player.loadAttempts, 2);
    expect(player.playing, isTrue);
  });
}

class _FakeMemoryMusicPlayer implements MemoryMusicPlayer {
  final List<String> loadedAssets = <String>[];
  bool looping = false;
  bool playing = false;
  double volume = 1.0;
  Duration position = Duration.zero;
  bool failNextLoad = false;
  int loadAttempts = 0;

  @override
  Future<void> configureAudioSession() async {}

  @override
  Future<void> loadAsset(String assetPath) async {
    loadAttempts++;
    if (failNextLoad) {
      failNextLoad = false;
      throw StateError("load failed");
    }
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
