import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/home/memories/memory_progress_indicator.dart";

void main() {
  group("memory progress layout", () {
    test("derives equal segment widths from the available width", () {
      expect(
        memoryProgressSegmentWidthForLayout(totalSteps: 6, availableWidth: 343),
        closeTo(48.833333, 0.000001),
      );
      expect(
        memoryProgressSegmentWidthForLayout(
          totalSteps: 18,
          availableWidth: 343,
        ),
        closeTo(9.611111, 0.000001),
      );
    });

    test(
      "switches when equal chunks would be narrower than the legibility limit",
      () {
        expect(
          memoryProgressUsesContinuousTrack(
            totalSteps: 19,
            availableWidth: 343,
          ),
          isFalse,
        );
        expect(
          memoryProgressUsesContinuousTrack(
            totalSteps: 20,
            availableWidth: 343,
          ),
          isTrue,
        );
        expect(
          memoryProgressUsesContinuousTrack(
            totalSteps: 41,
            availableWidth: 736,
          ),
          isFalse,
        );
        expect(
          memoryProgressUsesContinuousTrack(
            totalSteps: 42,
            availableWidth: 736,
          ),
          isTrue,
        );
      },
    );
  });

  for (final availableWidth in [343.0, 736.0]) {
    for (final totalSteps in [6, 18]) {
      testWidgets("fills ${availableWidth}px with $totalSteps equal chunks", (
        tester,
      ) async {
        final currentIndex = totalSteps ~/ 2;

        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: SizedBox(
                width: availableWidth,
                child: MemoryProgressIndicator(
                  totalSteps: totalSteps,
                  currentIndex: currentIndex,
                ),
              ),
            ),
          ),
        );

        expect(find.byType(Row), findsOneWidget);
        final widths = [
          for (var index = 0; index < totalSteps; index++)
            tester
                .getSize(find.byKey(ValueKey("memory-progress-segment-$index")))
                .width,
        ];
        final segmentWidth = widths.first;
        final currentWidth = widths[currentIndex];

        expect(currentWidth / segmentWidth, closeTo(1.0, 0.000001));
        for (final width in widths) {
          expect(width, closeTo(segmentWidth, 0.000001));
        }
        expect(
          widths.reduce((left, right) => left + right) +
              ((totalSteps - 1) * kMemoryProgressGap),
          closeTo(availableWidth, 0.000001),
        );
      });
    }
  }

  testWidgets("uses the full track when segmented chunks become too narrow", (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: SizedBox(
            width: 343,
            child: MemoryProgressIndicator(totalSteps: 20, currentIndex: 7),
          ),
        ),
      ),
    );

    expect(find.byType(Row), findsNothing);
    expect(tester.getSize(find.byType(LinearProgressIndicator)).width, 343);
  });
}
