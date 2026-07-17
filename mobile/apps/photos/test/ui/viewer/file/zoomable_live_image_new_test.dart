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

  test("untagged motion photos retain playback after probing", () async {
    var probes = 0;
    final router = LiveImageLongPressRouter(
      initialAvailability: MotionPhotoAvailability.unknown,
      probeMotionPhoto: () async {
        probes++;
        return MotionPhotoAvailability.present;
      },
    );

    expect(await router.resolve(), LiveImageLongPressAction.playback);
    expect(await router.resolve(), LiveImageLongPressAction.playback);
    expect(probes, 1);
  });

  test("untagged still photos fall back to text selection", () async {
    var probes = 0;
    final router = LiveImageLongPressRouter(
      initialAvailability: MotionPhotoAvailability.unknown,
      probeMotionPhoto: () async {
        probes++;
        return MotionPhotoAvailability.absent;
      },
    );

    expect(await router.resolve(), LiveImageLongPressAction.textSelection);
    expect(await router.resolve(), LiveImageLongPressAction.textSelection);
    expect(probes, 1);
  });
}

class _MockBuildContext extends Mock implements BuildContext {}
