import 'package:flutter/material.dart';
import "package:photos/ui/tools/editor/video_editor/ente_video_editor_controller.dart";
import "package:photos/ui/tools/editor/video_editor/ente_video_editor_widgets.dart";
import "package:photos/ui/tools/editor/video_editor/ente_video_trim_slider.dart";

class VideoTrimPage extends StatelessWidget {
  const VideoTrimPage({super.key, required this.controller});

  final EnteVideoEditorController controller;

  @override
  Widget build(BuildContext context) {
    const height = 60.0;
    return EnteVideoEditorSubPage(
      controller: controller,
      preview: EnteVideoPreview(controller: controller),
      actions: Padding(
        padding: const EdgeInsets.only(top: 16),
        child: EnteVideoTrimSlider(
          controller: controller,
          height: height,
          horizontalMargin: height / 4,
        ),
      ),
    );
  }
}
