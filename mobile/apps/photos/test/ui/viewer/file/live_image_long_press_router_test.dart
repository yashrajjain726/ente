import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/live_image_long_press_router.dart";

void main() {
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
