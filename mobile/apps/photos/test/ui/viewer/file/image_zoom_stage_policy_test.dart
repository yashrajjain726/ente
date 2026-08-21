import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/image_zoom_stage_policy.dart";

void main() {
  const standardPolicy = ImageZoomStagePolicy(
    initialScale: 1,
    coverScale: 1.5,
    originalScale: 3,
    maxScale: 6,
  );

  test("normal double-tap cycle advances through every distinct stage", () {
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      ImageZoomStage.covering,
    );
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.covering,
        currentScale: 1.5,
      ),
      ImageZoomStage.originalSize,
    );
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.originalSize,
        currentScale: 3,
      ),
      ImageZoomStage.initial,
    );
  });

  test("duplicate or clamped stages are skipped", () {
    const duplicateCover = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 1,
      originalScale: 3,
      maxScale: 6,
    );
    expect(
      duplicateCover.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      ImageZoomStage.originalSize,
    );

    const duplicateOriginal = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 2,
      originalScale: 2,
      maxScale: 6,
    );
    expect(
      duplicateOriginal.nextDoubleTapStage(
        currentStage: ImageZoomStage.covering,
        currentScale: 2,
      ),
      ImageZoomStage.initial,
    );

    const clamped = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 2,
      originalScale: 3,
      maxScale: 1.5,
    );
    expect(
      clamped.nextDoubleTapStage(
        currentStage: ImageZoomStage.covering,
        currentScale: 1.5,
      ),
      ImageZoomStage.initial,
    );

    const allEqual = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 1,
      originalScale: 1,
      maxScale: 1,
    );
    expect(
      allEqual.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      isNull,
    );
  });

  test("gesture stage always resets to initial", () {
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.gesture,
        currentScale: 2.25,
      ),
      ImageZoomStage.initial,
    );
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.gesture,
        currentScale: 1,
      ),
      ImageZoomStage.initial,
    );
  });
}
