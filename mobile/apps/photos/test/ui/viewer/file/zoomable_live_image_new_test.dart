import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mockito/mockito.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file/file_type.dart";
import "package:photos/ui/viewer/file/file_widget.dart";
import "package:photos/ui/viewer/file/zoomable_live_image_new.dart";

void main() {
  test("FileWidget forwards still-photo long presses", () {
    final file = EnteFile()
      ..generatedID = 1
      ..fileType = FileType.image;
    void onLongPressStart(LongPressStartDetails _) {}

    final built = FileWidget(
      file,
      tagPrefix: "test",
      onLongPressStart: onLongPressStart,
    ).build(_MockBuildContext());

    expect(built, isA<ZoomableLiveImageNew>());
    expect(
      (built as ZoomableLiveImageNew).onLongPressStart,
      same(onLongPressStart),
    );
  });

  testWidgets("text selection owns the long press when provided", (
    tester,
  ) async {
    var textSelectionStarts = 0;
    var playbackStarts = 0;
    var playbackEnds = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: buildLiveImageLongPressGesture(
          onTextSelectionStart: (_) => textSelectionStarts++,
          onPlaybackStart: (_) => playbackStarts++,
          onPlaybackEnd: (_) => playbackEnds++,
          child: const ColoredBox(key: Key("image"), color: Colors.black),
        ),
      ),
    );

    await tester.longPress(find.byKey(const Key("image")));

    expect(textSelectionStarts, 1);
    expect(playbackStarts, 0);
    expect(playbackEnds, 0);
  });

  testWidgets("live-photo playback keeps its long-press lifecycle", (
    tester,
  ) async {
    var playbackStarts = 0;
    var playbackEnds = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: buildLiveImageLongPressGesture(
          onPlaybackStart: (_) => playbackStarts++,
          onPlaybackEnd: (_) => playbackEnds++,
          child: const ColoredBox(key: Key("image"), color: Colors.black),
        ),
      ),
    );

    await tester.longPress(find.byKey(const Key("image")));

    expect(playbackStarts, 1);
    expect(playbackEnds, 1);
  });
}

class _MockBuildContext extends Mock implements BuildContext {}
