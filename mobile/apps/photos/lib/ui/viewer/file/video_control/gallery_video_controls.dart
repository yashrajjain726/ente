import "package:flutter/material.dart";
import "package:photos/theme/colors.dart";
import "package:photos/theme/ente_theme.dart";
import "package:photos/ui/viewer/file/video_control/mute_button.dart";

const kGalleryVideoProgressBottom = 64.0;
const kGalleryVideoProgressHeight = 16.0;
const kGalleryVideoProgressRowBottom = 56.0;
const kGalleryVideoProgressRowHeight = 32.0;
const kGalleryVideoCaptionGap = 6.0;
const kGalleryVideoCaptionLineHeight = 16.0;
const kGalleryVideoScrimTopPadding = 12.0;

class GalleryVideoSliderTrackShape extends RoundedRectSliderTrackShape {
  const GalleryVideoSliderTrackShape();

  @override
  void paint(
    PaintingContext context,
    Offset offset, {
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required TextDirection textDirection,
    required Offset thumbCenter,
    Offset? secondaryOffset,
    bool isDiscrete = false,
    bool isEnabled = false,
    double additionalActiveTrackHeight = 2,
  }) {
    super.paint(
      context,
      offset,
      parentBox: parentBox,
      sliderTheme: sliderTheme,
      enableAnimation: enableAnimation,
      textDirection: textDirection,
      thumbCenter: thumbCenter,
      secondaryOffset: secondaryOffset,
      isDiscrete: isDiscrete,
      isEnabled: isEnabled,
      additionalActiveTrackHeight: 0,
    );
  }
}

class GalleryVideoControlScrim extends StatelessWidget {
  final bool hasCaption;

  const GalleryVideoControlScrim({required this.hasCaption, super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Align(
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          width: double.infinity,
          height:
              MediaQuery.paddingOf(context).bottom +
              kGalleryVideoProgressBottom +
              kGalleryVideoProgressHeight +
              (hasCaption
                  ? kGalleryVideoCaptionGap + kGalleryVideoCaptionLineHeight
                  : 0) +
              kGalleryVideoScrimTopPadding,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.6),
                  Colors.black.withValues(alpha: 0.72),
                ],
                stops: const [0, 0.8, 1],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class GalleryVideoProgressRow extends StatelessWidget {
  final Widget seekBar;
  final String elapsedTime;
  final String totalTime;

  const GalleryVideoProgressRow({
    required this.seekBar,
    required this.elapsedTime,
    required this.totalTime,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final safePadding = MediaQuery.paddingOf(context);
    final timeStyle = getEnteTextTheme(context).tiny.copyWith(
      color: textBaseDark.withValues(alpha: 0.85),
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Padding(
      padding: EdgeInsets.only(
        left: safePadding.left + 16,
        right: safePadding.right + 16,
      ),
      child: SizedBox(
        height: kGalleryVideoProgressRowHeight,
        child: Row(
          children: [
            Expanded(child: seekBar),
            const SizedBox(width: 16),
            Transform.translate(
              offset: const Offset(0, -1),
              child: Text('$elapsedTime / $totalTime', style: timeStyle),
            ),
            const SizedBox(width: 7),
            const VideoMuteButton(),
          ],
        ),
      ),
    );
  }
}

double galleryVideoStreamControlBottom(bool hasCaption) {
  return kGalleryVideoProgressBottom +
      kGalleryVideoProgressHeight +
      (hasCaption
          ? kGalleryVideoCaptionGap + kGalleryVideoCaptionLineHeight
          : 0) +
      8;
}
