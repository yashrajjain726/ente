import "dart:math" as math;

import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/image_zoom_geometry.dart";

void main() {
  group("ImageZoomGeometry", () {
    test("calculates contain, cover, original, and maximum scales", () {
      final geometry = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
        maxScaleOverCover: 2,
      );

      expect(geometry.fittedImageSize, const Size(400, 200));
      expect(geometry.fittedImageRect, const Rect.fromLTWH(0, 50, 400, 200));
      expect(geometry.viewportCenter, const Offset(200, 150));
      expect(geometry.initialScale, 1);
      expect(geometry.coverScale, 1.5);
      expect(geometry.originalScale, 2.5);
      expect(geometry.maxScale, 3);
    });

    test("uses exact configuration equality and tolerant coordinates", () {
      final first = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
      );
      final exactCopy = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
      );
      final higherResolution = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(2000, 1000),
      );
      final rotated = _geometry(
        viewportSize: const Size(300, 400),
        imageSize: const Size(1000, 500),
      );
      final withinCoordinateEpsilon = _geometry(
        viewportSize: const Size(400.0005, 300),
        imageSize: const Size(1000, 500),
      );
      final outsideCoordinateEpsilon = _geometry(
        viewportSize: const Size(400.01, 300),
        imageSize: const Size(1000, 500),
      );

      expect(first.hasSameConfiguration(exactCopy), isTrue);
      expect(first.hasSameConfiguration(higherResolution), isFalse);
      expect(first.coordinatesMatch(higherResolution), isTrue);
      expect(first.coordinatesMatch(withinCoordinateEpsilon), isTrue);
      expect(first.coordinatesMatch(outsideCoordinateEpsilon), isFalse);
      expect(first.coordinatesMatch(rotated), isFalse);
    });

    test("builds a bounded focal target around the tapped scene point", () {
      final geometry = _geometry(
        viewportSize: const Size(400, 400),
        imageSize: const Size(800, 800),
      );
      final initial = geometry.matrixForScaleAndOffset(1, Offset.zero);
      final target = geometry.matrixForFocalPoint(
        initial,
        const Offset(100, 120),
        2,
      );

      expect(geometry.scenePoint(target, geometry.viewportCenter).dx, 100);
      expect(geometry.scenePoint(target, geometry.viewportCenter).dy, 120);
      final state = geometry.describe(target);
      expect(state.absoluteScale, 2);
      expect(state.semanticOffset, const Offset(200, 160));
    });

    test("clamps scale and offsets to visible image bounds", () {
      final geometry = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
        maxScaleOverCover: 2,
      );
      final unbounded = geometry.matrixForScaleAndOffset(
        5,
        const Offset(900, -900),
      );
      final state = geometry.describe(geometry.sanitize(unbounded));

      expect(state.absoluteScale, 3);
      expect(state.semanticOffset, const Offset(400, -150));
      expect(geometry.clampScale(0.5), 1);
      expect(geometry.clampScale(8), 3);
    });

    test("describes the normalized OCR-compatible semantic transform", () {
      final geometry = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
      );
      final matrix = geometry.matrixForScaleAndOffset(2, const Offset(30, -20));
      final state = geometry.describe(matrix);

      expect(state.absoluteScale, 2);
      expect(state.relativeScale, 2);
      expect(state.semanticOffset, const Offset(30, -20));
      expect(state.isInitial, isFalse);
    });

    test("describes an initial cover transform as semantic identity", () {
      final geometry = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
        initialFit: BoxFit.cover,
      );
      final state = geometry.describe(
        geometry.matrixForScaleAndOffset(geometry.initialScale, Offset.zero),
      );

      expect(state.absoluteScale, 1.5);
      expect(state.relativeScale, 1);
      expect(state.semanticOffset, Offset.zero);
      expect(state.isInitial, isTrue);
    });
  });

  group("ImageZoomRebase", () {
    test("preserves relative scale and normalized focus", () {
      final before = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
      );
      final after = _geometry(
        viewportSize: const Size(300, 400),
        imageSize: const Size(1000, 500),
      );
      final matrix = before.sanitize(
        before.matrixForScaleAndOffset(2, const Offset(50, 0)),
      );
      final rebase = ImageZoomRebase.capture(before, matrix);
      final resolved = rebase.resolve(after);
      final resolvedState = after.describe(resolved);
      final recaptured = ImageZoomRebase.capture(after, resolved);

      expect(resolvedState.relativeScale, closeTo(rebase.relativeScale, 1e-9));
      expect(
        recaptured.normalizedFocus.dx,
        closeTo(rebase.normalizedFocus.dx, 1e-9),
      );
      expect(
        recaptured.normalizedFocus.dy,
        closeTo(rebase.normalizedFocus.dy, 1e-9),
      );
    });

    test("keeps out-of-bounds focus until target sanitization", () {
      final before = _geometry(
        viewportSize: const Size(400, 300),
        imageSize: const Size(1000, 500),
      );
      final after = _geometry(
        viewportSize: const Size(300, 400),
        imageSize: const Size(1000, 500),
      );
      final unbounded = before.matrixForScaleAndTranslation(
        2,
        const Offset(900, 700),
      );
      final rebase = ImageZoomRebase.capture(before, unbounded);

      expect(
        rebase.normalizedFocus.dx < 0 || rebase.normalizedFocus.dx > 1,
        isTrue,
      );
      expect(
        rebase.normalizedFocus.dy < 0 || rebase.normalizedFocus.dy > 1,
        isTrue,
      );

      final resolvedState = after.describe(rebase.resolve(after));
      final maxOffsetX = math.max(
        0,
        (after.fittedImageSize.width * resolvedState.absoluteScale -
                after.viewportSize.width) /
            2,
      );
      final maxOffsetY = math.max(
        0,
        (after.fittedImageSize.height * resolvedState.absoluteScale -
                after.viewportSize.height) /
            2,
      );
      expect(
        resolvedState.semanticOffset.dx.abs(),
        lessThanOrEqualTo(maxOffsetX),
      );
      expect(
        resolvedState.semanticOffset.dy.abs(),
        lessThanOrEqualTo(maxOffsetY),
      );
    });
  });
}

ImageZoomGeometry _geometry({
  required Size viewportSize,
  required Size imageSize,
  BoxFit initialFit = BoxFit.contain,
  double maxScaleOverCover = double.infinity,
}) => ImageZoomGeometry.calculate(
  viewportSize: viewportSize,
  imageSize: imageSize,
  initialFit: initialFit,
  maxScaleOverCover: maxScaleOverCover,
)!;
