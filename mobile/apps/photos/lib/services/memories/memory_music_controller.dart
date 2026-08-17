import "dart:async";

import "package:flutter/foundation.dart";
import "package:logging/logging.dart";
import "package:photos/services/memories/memory_music_catalog.dart";
import "package:photos/services/memories/memory_music_source_loader.dart";

enum _MemoryMusicPlaybackStatus { idle, loading, ready, failed }

enum _MemoryMusicPauseReason { appBackground, viewerAction, videoItem }

class MemoryMusicController extends ChangeNotifier {
  final MemoryMusicCatalog _catalog;
  final Map<String, String> _assignments;
  final MemoryMusicPlayer _player;
  final Future<void> Function(bool isMuted) _persistMuted;
  final Logger _logger = Logger("MemoryMusicController");
  final Set<_MemoryMusicPauseReason> _pauseReasons =
      <_MemoryMusicPauseReason>{};

  Future<void>? _audioSessionInitialization;

  _MemoryMusicPlaybackStatus _status = _MemoryMusicPlaybackStatus.idle;
  String? _activeMemoryID;
  bool _isMuted;
  bool _isDisposed = false;
  int _loadGeneration = 0;

  MemoryMusicController({
    required MemoryMusicCatalog catalog,
    required Map<String, String> assignments,
    required bool initiallyMuted,
    required Future<void> Function(bool isMuted) persistMuted,
    MemoryMusicPlayer? player,
  }) : _catalog = catalog,
       _assignments = assignments,
       _isMuted = initiallyMuted,
       _persistMuted = persistMuted,
       _player = player ?? JustAudioMemoryMusicPlayer();

  bool get isMuted => _isMuted;

  Future<void> activateMemory(
    String memoryID, {
    required bool currentItemIsVideo,
  }) async {
    if (_isDisposed) return;

    final sameMemory = _activeMemoryID == memoryID;
    _activeMemoryID = memoryID;
    _setPauseReason(_MemoryMusicPauseReason.videoItem, currentItemIsVideo);
    if (sameMemory &&
        (_status == _MemoryMusicPlaybackStatus.ready ||
            _status == _MemoryMusicPlaybackStatus.loading)) {
      await _synchronizePlayback();
      return;
    }

    final trackID = _assignments[memoryID];
    final track = trackID == null ? null : _catalog.trackForID(trackID);
    final generation = ++_loadGeneration;
    if (track == null) {
      _status = _MemoryMusicPlaybackStatus.idle;
      await _player.stop();
      return;
    }

    _status = _MemoryMusicPlaybackStatus.loading;
    try {
      await _ensureAudioSessionInitialized();
      if (!_isCurrentLoad(generation)) return;
      await _player.stop();
      if (!_isCurrentLoad(generation)) return;
      await const MemoryMusicSourceLoader().load(_player, track.source);
      if (!_isCurrentLoad(generation)) return;
      await _player.setLooping();
      await _player.setVolume(_isMuted ? 0.0 : 1.0);
      if (!_isCurrentLoad(generation)) return;
      _status = _MemoryMusicPlaybackStatus.ready;
      await _synchronizePlayback();
    } catch (error, stackTrace) {
      if (!_isCurrentLoad(generation)) return;
      _status = _MemoryMusicPlaybackStatus.failed;
      _logger.warning(
        "Failed to load memory music track ${track.id}",
        error,
        stackTrace,
      );
    }
  }

  Future<void> setCurrentItem({
    required String memoryID,
    required bool isVideo,
  }) async {
    if (_isDisposed || memoryID != _activeMemoryID) return;
    if (_setPauseReason(_MemoryMusicPauseReason.videoItem, isVideo)) {
      await _synchronizePlayback();
    }
  }

  Future<void> setMuted(bool value) async {
    if (_isDisposed || _isMuted == value) return;
    _isMuted = value;
    notifyListeners();
    try {
      await _player.setVolume(value ? 0.0 : 1.0);
    } catch (error, stackTrace) {
      _logger.fine("Failed to update memories music volume", error, stackTrace);
    }
    try {
      await _persistMuted(value);
    } catch (error, stackTrace) {
      _logger.warning(
        "Failed to persist memories audio mute state",
        error,
        stackTrace,
      );
    }
  }

  Future<void> toggleMuted() => setMuted(!_isMuted);

  Future<void> setAppActive(bool isActive) async {
    if (_setPauseReason(_MemoryMusicPauseReason.appBackground, !isActive)) {
      await _synchronizePlayback();
    }
  }

  Future<void> setViewerActionPaused(bool isPaused) async {
    if (_setPauseReason(_MemoryMusicPauseReason.viewerAction, isPaused)) {
      await _synchronizePlayback();
    }
  }

  bool _setPauseReason(_MemoryMusicPauseReason reason, bool shouldPause) {
    return shouldPause
        ? _pauseReasons.add(reason)
        : _pauseReasons.remove(reason);
  }

  Future<void> _synchronizePlayback() async {
    if (_isDisposed) return;
    final shouldPlay =
        _status == _MemoryMusicPlaybackStatus.ready && _pauseReasons.isEmpty;
    try {
      if (shouldPlay) {
        unawaited(
          _player.play().catchError((Object error, StackTrace stackTrace) {
            if (_isDisposed) return;
            _logger.fine(
              "Failed to start memory music playback",
              error,
              stackTrace,
            );
          }),
        );
      } else {
        await _player.pause();
      }
    } catch (error, stackTrace) {
      if (_isDisposed) return;
      _logger.fine(
        "Failed to synchronize memory music playback",
        error,
        stackTrace,
      );
    }
  }

  Future<void> _ensureAudioSessionInitialized() =>
      _audioSessionInitialization ??= _initializeAudioSession();

  Future<void> _initializeAudioSession() async {
    try {
      await _player.configureAudioSession();
    } catch (error, stackTrace) {
      _logger.fine(
        "Failed to configure the memory music audio session",
        error,
        stackTrace,
      );
    }
  }

  bool _isCurrentLoad(int generation) =>
      !_isDisposed && generation == _loadGeneration;

  @override
  void dispose() {
    _isDisposed = true;
    _loadGeneration++;
    unawaited(_player.dispose());
    super.dispose();
  }
}
