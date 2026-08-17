import "dart:async";

import 'package:flutter/material.dart';
import "package:photos/models/file/file_type.dart";
import "package:photos/models/memories/smart_memory.dart";
import "package:photos/theme/colors.dart";
import "package:photos/ui/home/memories/full_screen_memory.dart";
import "package:photos/ui/home/memories/memory_cover_util.dart";
import "package:photos/ui/home/memories/memory_music_session.dart";

class AllMemoriesPage extends StatefulWidget {
  final int initialPageIndex;
  final int inititalFileIndex;
  final List<SmartMemory> allMemories;
  final bool isFromWidgetOrNotifications;

  const AllMemoriesPage({
    super.key,
    required this.allMemories,
    required this.initialPageIndex,
    this.inititalFileIndex = 0,
    this.isFromWidgetOrNotifications = false,
  });

  @override
  State<AllMemoriesPage> createState() => _AllMemoriesPageState();
}

class _AllMemoriesPageState extends State<AllMemoriesPage>
    with SingleTickerProviderStateMixin {
  late PageController pageController;
  final Map<String, FileType> _currentItemTypes = <String, FileType>{};

  @override
  void initState() {
    super.initState();
    pageController = PageController(initialPage: widget.initialPageIndex);
  }

  @override
  void dispose() {
    pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final initialPageIndex = widget.initialPageIndex;
    final initialMemory = widget.allMemories[initialPageIndex];
    final initialItemIndex = _initialItemIndexForPage(initialPageIndex);
    return MemoryMusicSession(
      memories: widget.allMemories,
      initialMemoryID: initialMemory.id,
      initialItemIsVideo:
          initialMemory.memories[initialItemIndex].file.fileType ==
          FileType.video,
      builder: (context, musicController) => Container(
        width: double.infinity,
        height: double.infinity,
        color: backgroundColorDark,
        child: PageView.builder(
          controller: pageController,
          physics: const BouncingScrollPhysics(),
          hitTestBehavior: HitTestBehavior.translucent,
          itemCount: widget.allMemories.length,
          onPageChanged: (index) {
            final smartMemory = widget.allMemories[index];
            final currentItemType =
                _currentItemTypes[smartMemory.id] ??
                smartMemory
                    .memories[_initialItemIndexForPage(index)]
                    .file
                    .fileType;
            unawaited(
              musicController.activateMemory(
                smartMemory.id,
                currentItemIsVideo: currentItemType == FileType.video,
              ),
            );
          },
          itemBuilder: (context, index) {
            final smartMemory = widget.allMemories[index];
            final initialMemoryIndex = _initialItemIndexForPage(index);
            return FullScreenMemoryDataUpdater(
              initialIndex: initialMemoryIndex,
              memories: smartMemory.memories,
              child: FullScreenMemory(
                smartMemory.title,
                initialMemoryIndex,
                onCurrentItemChanged: (file) {
                  _currentItemTypes[smartMemory.id] = file.fileType;
                  unawaited(
                    musicController.setCurrentItem(
                      memoryID: smartMemory.id,
                      isVideo: file.fileType == FileType.video,
                    ),
                  );
                },
                onNextMemory: index < widget.allMemories.length - 1
                    ? () => pageController.nextPage(
                        duration: const Duration(milliseconds: 675),
                        curve: Curves.easeOutQuart,
                      )
                    : null,
                onPreviousMemory: index > 0
                    ? () => pageController.previousPage(
                        duration: const Duration(milliseconds: 675),
                        curve: Curves.easeOutQuart,
                      )
                    : null,
              ),
            );
          },
        ),
      ),
    );
  }

  int _initialItemIndexForPage(int pageIndex) {
    final memories = widget.allMemories[pageIndex].memories;
    return widget.isFromWidgetOrNotifications &&
            pageIndex == widget.initialPageIndex
        ? widget.inititalFileIndex
        : getNextMemoryIndex(memories);
  }
}
