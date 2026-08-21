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

  test("duplicate cover rung is skipped", () {
    const policy = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 1,
      originalScale: 3,
      maxScale: 6,
    );

    expect(
      policy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      ImageZoomStage.originalSize,
    );
  });

  test("duplicate original rung cycles from cover back to initial", () {
    const policy = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 2,
      originalScale: 2,
      maxScale: 6,
    );

    expect(
      policy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      ImageZoomStage.covering,
    );
    expect(
      policy.nextDoubleTapStage(
        currentStage: ImageZoomStage.covering,
        currentScale: 2,
      ),
      ImageZoomStage.initial,
    );
  });

  test("maximum-scale clamping collapses duplicate higher rungs", () {
    const policy = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 2,
      originalScale: 3,
      maxScale: 1.5,
    );

    expect(policy.targetScale(ImageZoomStage.covering), 1.5);
    expect(policy.targetScale(ImageZoomStage.originalSize), 1.5);
    expect(
      policy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1,
      ),
      ImageZoomStage.covering,
    );
    expect(
      policy.nextDoubleTapStage(
        currentStage: ImageZoomStage.covering,
        currentScale: 1.5,
      ),
      ImageZoomStage.initial,
    );
  });

  test("all programmatic targets equal produces no next stage", () {
    const policy = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 1,
      originalScale: 1,
      maxScale: 1,
    );

    for (final stage in <ImageZoomStage>[
      ImageZoomStage.initial,
      ImageZoomStage.covering,
      ImageZoomStage.originalSize,
    ]) {
      expect(
        policy.nextDoubleTapStage(currentStage: stage, currentScale: 1),
        isNull,
      );
    }
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

  test("target scales map stages and clamp to the configured range", () {
    expect(standardPolicy.targetScale(ImageZoomStage.initial), 1);
    expect(standardPolicy.targetScale(ImageZoomStage.gesture), 1);
    expect(standardPolicy.targetScale(ImageZoomStage.covering), 1.5);
    expect(standardPolicy.targetScale(ImageZoomStage.originalSize), 3);

    const clampedPolicy = ImageZoomStagePolicy(
      initialScale: 1,
      coverScale: 0.5,
      originalScale: 8,
      maxScale: 4,
    );
    expect(clampedPolicy.targetScale(ImageZoomStage.covering), 1);
    expect(clampedPolicy.targetScale(ImageZoomStage.originalSize), 4);
  });

  test("scale differences at epsilon are skipped and larger ones are not", () {
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1.499,
      ),
      ImageZoomStage.originalSize,
    );
    expect(
      standardPolicy.nextDoubleTapStage(
        currentStage: ImageZoomStage.initial,
        currentScale: 1.4989,
      ),
      ImageZoomStage.covering,
    );
  });
}
