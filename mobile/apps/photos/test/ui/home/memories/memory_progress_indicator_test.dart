import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/home/memories/memory_progress_indicator.dart";

void main() {
  group("memory progress capacity", () {
    test("derives phone and tablet capacity from the available width", () {
      expect(memoryProgressCapacityForWidth(375), 20);
      expect(memoryProgressCapacityForWidth(343), 18);
      expect(memoryProgressCapacityForWidth(736), 40);
      expect(memoryProgressCapacityForWidth(329), 17);
      expect(memoryProgressCapacityForWidth(330), 18);
    });

    test("switches to a continuous track only after capacity", () {
      expect(
        memoryProgressUsesContinuousTrack(totalSteps: 18, availableWidth: 343),
        isFalse,
      );
      expect(
        memoryProgressUsesContinuousTrack(totalSteps: 19, availableWidth: 343),
        isTrue,
      );
      expect(
        memoryProgressUsesContinuousTrack(totalSteps: 41, availableWidth: 736),
        isTrue,
      );
    });
  });

  testWidgets("keeps the current phone segment flexible at capacity", (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: SizedBox(
            width: 343,
            child: MemoryProgressIndicator(totalSteps: 18, currentIndex: 7),
          ),
        ),
      ),
    );

    expect(find.byType(Row), findsOneWidget);
    expect(tester.getSize(find.byType(LinearProgressIndicator)).width, 37);
  });

  testWidgets("uses the full track when the phone capacity overflows", (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: SizedBox(
            width: 343,
            child: MemoryProgressIndicator(totalSteps: 19, currentIndex: 7),
          ),
        ),
      ),
    );

    expect(find.byType(Row), findsNothing);
    expect(tester.getSize(find.byType(LinearProgressIndicator)).width, 343);
  });
}
