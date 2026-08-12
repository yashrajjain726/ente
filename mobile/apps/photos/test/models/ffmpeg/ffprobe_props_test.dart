import "package:photos/models/ffmpeg/ffprobe_keys.dart";
import "package:photos/models/ffmpeg/ffprobe_props.dart";
import "package:test/test.dart";

void main() {
  group("FFProbeProps", () {
    test("keeps a zero-denominator frame rate unformatted", () {
      final props = FFProbeProps.parseData({
        "streams": [
          {FFProbeKeys.rFrameRate: "1/0"},
        ],
      });

      expect(props.fps, "1/0");
      expect(props.propData![FFProbeKeys.rFrameRate], "1/0");
    });

    test("formats a valid frame rate", () {
      final props = FFProbeProps.parseData({
        "streams": [
          {FFProbeKeys.rFrameRate: "30000/1001"},
        ],
      });

      expect(props.fps, "29.97");
    });
  });
}
