import "dart:async";

import "package:flutter/material.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/memories/just_audio_memory_music_player.dart";
import "package:photos/services/memories/memory_music_controller.dart";
import "package:photos/services/memories/memory_music_selector.dart";
import "package:photos/services/memories/memory_music_service.dart";

class MemoryMusicSession extends StatefulWidget {
  final List<String> memoryIDs;
  final Widget child;

  const MemoryMusicSession({
    required this.memoryIDs,
    required this.child,
    super.key,
  });

  @override
  State<MemoryMusicSession> createState() => _MemoryMusicSessionState();
}

class _MemoryMusicSessionState extends State<MemoryMusicSession>
    with WidgetsBindingObserver {
  MemoryMusicController? _controller;
  bool _isAppActive = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycleState = WidgetsBinding.instance.lifecycleState;
    _isAppActive =
        lifecycleState == null || lifecycleState == AppLifecycleState.resumed;
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final tracks = await MemoryMusicService.instance.prepare();
    if (!mounted || tracks.isEmpty) return;
    final assignments = assignMemoryMusicTracks(
      memoryIDs: widget.memoryIDs,
      tracks: tracks,
    );
    final controller = MemoryMusicController(
      assignments: assignments,
      initiallyMuted: localSettings.isMemoriesAudioMuted(),
      persistMuted: localSettings.setMemoriesAudioMuted,
      player: JustAudioMemoryMusicPlayer(),
      tracks: tracks,
    );
    if (!_isAppActive) unawaited(controller.setAppActive(false));
    setState(() => _controller = controller);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _isAppActive = state == AppLifecycleState.resumed;
    final controller = _controller;
    if (controller != null) {
      unawaited(controller.setAppActive(_isAppActive));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MemoryMusicScope(controller: _controller, child: widget.child);
  }
}

class MemoryMusicScope extends InheritedNotifier<MemoryMusicController> {
  const MemoryMusicScope({
    required MemoryMusicController? controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static MemoryMusicController? maybeOf(
    BuildContext context, {
    bool listen = true,
  }) {
    final scope = listen
        ? context.dependOnInheritedWidgetOfExactType<MemoryMusicScope>()
        : context.getInheritedWidgetOfExactType<MemoryMusicScope>();
    return scope?.notifier;
  }
}
