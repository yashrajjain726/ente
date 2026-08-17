import "package:audio_session/audio_session.dart";
import "package:just_audio/just_audio.dart";

abstract interface class MemoryMusicPlayer {
  Future<void> configureAudioSession();

  Future<void> loadAsset(String assetPath);

  Future<void> setLooping();

  Future<void> setVolume(double volume);

  Future<void> play();

  Future<void> pause();

  Future<void> stop();

  Future<void> dispose();
}

class JustAudioMemoryMusicPlayer implements MemoryMusicPlayer {
  final AudioPlayer _player;

  JustAudioMemoryMusicPlayer() : _player = AudioPlayer();

  @override
  Future<void> configureAudioSession() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());
  }

  @override
  Future<void> loadAsset(String assetPath) async {
    await _player.setAsset(assetPath, preload: true);
  }

  @override
  Future<void> setLooping() => _player.setLoopMode(LoopMode.one);

  @override
  Future<void> setVolume(double volume) => _player.setVolume(volume);

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> stop() => _player.stop();

  @override
  Future<void> dispose() => _player.dispose();
}
