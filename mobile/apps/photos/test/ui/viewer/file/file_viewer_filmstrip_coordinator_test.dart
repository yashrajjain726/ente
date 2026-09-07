import "package:flutter/foundation.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_coordinator.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_event.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_preview_layer.dart";

void main() {
  test("a tap cancels transient state and jumps immediately", () {
    final harness = _CoordinatorHarness();
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.coordinator.previewIndex.value, 8);

    harness.send(12, FileViewerFilmstripEventType.tap);

    expect(harness.jumps, [12]);
    expect(harness.selectedIndex, 12);
    expect(harness.coordinator.previewIndex.value, isNull);
    expect(harness.coordinator.isUserScrollSessionActive, isFalse);

    harness.send(12, FileViewerFilmstripEventType.tap);
    expect(harness.jumps, [12]);
  });

  test("scrubbing previews live and requests one media pause per session", () {
    final harness = _CoordinatorHarness();
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    expect(harness.coordinator.isUserScrollSessionActive, isTrue);
    expect(harness.coordinator.previewIndex.value, isNull);

    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.coordinator.previewIndex.value, 8);
    expect(harness.pauseCount, 1);

    harness.send(9, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.coordinator.previewIndex.value, 9);

    harness.send(7, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.coordinator.previewIndex.value, isNull);

    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.coordinator.previewIndex.value, 8);
    expect(harness.pauseCount, 1);
    expect(harness.jumps, isEmpty);
    expect(harness.coordinator.isUserScrollSessionActive, isTrue);

    harness.send(7, FileViewerFilmstripEventType.scrubPreview);
    harness.send(7, FileViewerFilmstripEventType.scrubCommit);
    expect(harness.coordinator.previewIndex.value, isNull);
    expect(harness.coordinator.isUserScrollSessionActive, isFalse);
    expect(harness.jumps, isEmpty);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    expect(harness.pauseCount, 2);
    expect(harness.coordinator.isUserScrollSessionActive, isTrue);
  });

  test("commit installs its handoff before a synchronous page change", () {
    final harness = _CoordinatorHarness();
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    harness.send(8, FileViewerFilmstripEventType.scrubCommit);

    expect(harness.jumps, [8]);
    expect(harness.selectedIndex, 8);
    expect(harness.coordinator.previewIndex.value, 8);
    expect(harness.coordinator.isUserScrollSessionActive, isFalse);
    expect(harness.paintBarriers, hasLength(1));

    harness.coordinator.handlePageChanged(8, harness.identities[8]);
    expect(harness.paintBarriers, hasLength(1));

    harness.send(8, FileViewerFilmstripEventType.scrubCommit);
    expect(harness.jumps, [8]);
    expect(harness.coordinator.previewIndex.value, 8);

    harness.paintBarriers.single();
    expect(harness.coordinator.previewIndex.value, isNull);
  });

  test("a detached page viewer cancels the commit", () {
    final harness = _CoordinatorHarness()..pageAttached = false;
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    harness.send(8, FileViewerFilmstripEventType.scrubCommit);

    expect(harness.jumps, isEmpty);
    expect(harness.coordinator.previewIndex.value, isNull);
    expect(harness.coordinator.isUserScrollSessionActive, isFalse);
    expect(harness.paintBarriers, isEmpty);
  });

  test("a stale paint barrier cannot clear a newer scrub preview", () {
    final harness = _CoordinatorHarness();
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    harness.send(8, FileViewerFilmstripEventType.scrubCommit);
    final staleBarrier = harness.paintBarriers.single;

    harness.send(8, FileViewerFilmstripEventType.scrubStart);
    harness.send(9, FileViewerFilmstripEventType.scrubPreview);
    staleBarrier();

    expect(harness.coordinator.previewIndex.value, 9);
    expect(harness.coordinator.isUserScrollSessionActive, isTrue);
  });

  test("page handoff requires the same file identity", () {
    final harness = _CoordinatorHarness(synchronousPageChanges: false);
    addTearDown(harness.dispose);

    harness.send(7, FileViewerFilmstripEventType.scrubStart);
    harness.send(8, FileViewerFilmstripEventType.scrubPreview);
    harness.send(8, FileViewerFilmstripEventType.scrubCommit);
    final committedIdentity = harness.identities[8];

    harness.coordinator.handlePageChanged(8, Object());
    expect(harness.paintBarriers, isEmpty);

    harness.coordinator.handlePageChanged(8, committedIdentity);
    expect(harness.paintBarriers, hasLength(1));
    harness.identities[8] = Object();
    harness.paintBarriers.single();

    expect(harness.coordinator.previewIndex.value, 8);
  });

  testWidgets("keeps the preview through the committed page's first paint", (
    tester,
  ) async {
    var selectedIndex = 0;
    final identities = [Object(), Object()];
    final committedPage = ValueNotifier(0);
    final targetPainter = _CountingPainter();
    late FileViewerFilmstripCoordinator coordinator;
    coordinator = FileViewerFilmstripCoordinator(
      currentIndex: () => selectedIndex,
      identityAt: (index) => identities[index],
      jumpToPageImmediately: (index) {
        selectedIndex = index;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          committedPage.value = index;
          coordinator.handlePageChanged(index, identities[index]);
        });
        tester.binding.scheduleFrame();
        return true;
      },
      requestPauseCurrentMedia: () {},
    );
    addTearDown(coordinator.dispose);
    addTearDown(committedPage.dispose);

    await tester.pumpWidget(
      _PreviewHandoffHarness(
        previewIndex: coordinator.previewIndex,
        committedPage: committedPage,
        targetPainter: targetPainter,
      ),
    );

    coordinator.handleEvent((
      index: 0,
      type: FileViewerFilmstripEventType.scrubStart,
    ));
    coordinator.handleEvent((
      index: 1,
      type: FileViewerFilmstripEventType.scrubPreview,
    ));
    await tester.pump();
    expect(find.byKey(fileViewerFilmstripPreviewKey), findsOneWidget);
    expect(targetPainter.paintCount, 0);

    coordinator.handleEvent((
      index: 1,
      type: FileViewerFilmstripEventType.scrubCommit,
    ));
    await tester.pump();

    expect(committedPage.value, 1);
    expect(targetPainter.paintCount, 0);
    expect(find.byKey(fileViewerFilmstripPreviewKey), findsOneWidget);

    await tester.pump();

    expect(targetPainter.paintCount, greaterThan(0));
    expect(find.byKey(fileViewerFilmstripPreviewKey), findsOneWidget);
    expect(coordinator.previewIndex.value, isNull);

    await tester.pump();
    expect(find.byKey(fileViewerFilmstripPreviewKey), findsNothing);
  });
}

class _CoordinatorHarness {
  final List<Object> identities = List.generate(20, (_) => Object());
  final List<int> jumps = [];
  final List<VoidCallback> paintBarriers = [];
  final bool synchronousPageChanges;

  late final FileViewerFilmstripCoordinator coordinator;
  int selectedIndex = 7;
  int pauseCount = 0;
  bool pageAttached = true;

  _CoordinatorHarness({this.synchronousPageChanges = true}) {
    coordinator = FileViewerFilmstripCoordinator(
      currentIndex: () => selectedIndex,
      identityAt: (index) =>
          index >= 0 && index < identities.length ? identities[index] : null,
      jumpToPageImmediately: (index) {
        if (!pageAttached) return false;
        jumps.add(index);
        selectedIndex = index;
        if (synchronousPageChanges) {
          coordinator.handlePageChanged(index, identities[index]);
        }
        return true;
      },
      requestPauseCurrentMedia: () => pauseCount++,
      scheduleAfterNextFramePaint: paintBarriers.add,
    );
  }

  void send(int index, FileViewerFilmstripEventType type) {
    coordinator.handleEvent((index: index, type: type));
  }

  void dispose() => coordinator.dispose();
}

class _PreviewHandoffHarness extends StatelessWidget {
  final ValueListenable<int?> previewIndex;
  final ValueNotifier<int> committedPage;
  final CustomPainter targetPainter;

  const _PreviewHandoffHarness({
    required this.previewIndex,
    required this.committedPage,
    required this.targetPainter,
  });

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          ValueListenableBuilder<int>(
            valueListenable: committedPage,
            builder: (context, page, _) => page == 1
                ? CustomPaint(
                    painter: targetPainter,
                    child: const ColoredBox(color: Colors.blue),
                  )
                : const ColoredBox(color: Colors.black),
          ),
          FileViewerFilmstripPreviewLayer(
            previewIndex: previewIndex,
            itemBuilder: (context, index) => ColoredBox(
              color: Colors.grey,
              child: Center(child: Text("Preview $index")),
            ),
          ),
        ],
      ),
    ),
  );
}

class _CountingPainter extends CustomPainter {
  int paintCount = 0;

  @override
  void paint(Canvas canvas, Size size) {
    paintCount++;
  }

  @override
  bool shouldRepaint(covariant _CountingPainter oldDelegate) => false;
}
