import "dart:async";

import "package:flutter/material.dart";
import "package:photos/models/memories/smart_memory.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/memories/memory_music_catalog.dart";
import "package:photos/services/memories/memory_music_controller.dart";
import "package:photos/services/memories/memory_music_selector.dart";

class MemoryMusicSession extends StatefulWidget {
  final List<SmartMemory> memories;
  final String initialMemoryID;
  final bool initialItemIsVideo;
  final Widget Function(BuildContext context, MemoryMusicController controller)
  builder;

  const MemoryMusicSession({
    required this.memories,
    required this.initialMemoryID,
    required this.initialItemIsVideo,
    required this.builder,
    super.key,
  });

  @override
  State<MemoryMusicSession> createState() => _MemoryMusicSessionState();
}

class _MemoryMusicSessionState extends State<MemoryMusicSession>
    with WidgetsBindingObserver {
  late final MemoryMusicController _controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final catalog = MemoryMusicCatalog.bundled;
    final assignments = assignMemoryMusicTracks(
      memoryIDs: widget.memories.map((memory) => memory.id),
      tracks: catalog.tracks,
    );
    _controller = MemoryMusicController(
      catalog: catalog,
      assignments: assignments,
      initiallyMuted: localSettings.isMemoriesAudioMuted(),
      persistMuted: localSettings.setMemoriesAudioMuted,
    );
    unawaited(
      _controller.activateMemory(
        widget.initialMemoryID,
        currentItemIsVideo: widget.initialItemIsVideo,
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    unawaited(_controller.setAppActive(state == AppLifecycleState.resumed));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MemoryMusicScope(
      controller: _controller,
      child: Builder(
        builder: (context) => widget.builder(context, _controller),
      ),
    );
  }
}

class MemoryMusicScope extends InheritedNotifier<MemoryMusicController> {
  const MemoryMusicScope({
    required MemoryMusicController controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static MemoryMusicController of(BuildContext context, {bool listen = true}) {
    final scope = listen
        ? context.dependOnInheritedWidgetOfExactType<MemoryMusicScope>()
        : context.getInheritedWidgetOfExactType<MemoryMusicScope>();
    return scope!.notifier!;
  }
}
