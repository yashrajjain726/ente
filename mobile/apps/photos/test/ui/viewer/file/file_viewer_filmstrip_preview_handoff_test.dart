import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip_preview_handoff.dart";

const _previewKey = ValueKey<String>("filmstrip-preview-handoff-test");
const _targetPageKey = ValueKey<String>("filmstrip-target-page-test");

void main() {
  testWidgets("keeps the preview through the committed page's first paint", (
    tester,
  ) async {
    final handoff = FileViewerFilmstripPreviewHandoff();
    final committedPage = ValueNotifier(0);
    final targetPainter = _CountingPainter();
    addTearDown(handoff.dispose);
    addTearDown(committedPage.dispose);

    await tester.pumpWidget(
      _HandoffHarness(
        handoff: handoff,
        committedPage: committedPage,
        targetPainter: targetPainter,
      ),
    );

    handoff.showPreview(1);
    await tester.pump();
    expect(find.byKey(_previewKey), findsOneWidget);
    expect(targetPainter.paintCount, 0);

    final targetFile = Object();
    handoff.beginCommit(index: 1, fileIdentity: targetFile);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      committedPage.value = 1;
      handoff.onPageChanged(
        index: 1,
        fileIdentity: targetFile,
        onPagePainted: handoff.clear,
      );
    });
    tester.binding.scheduleFrame();

    expect(handoff.value, 1);

    await tester.pump();
    expect(committedPage.value, 1);
    expect(targetPainter.paintCount, 0);
    expect(find.byKey(_previewKey), findsOneWidget);

    await tester.pump();

    expect(find.byKey(_targetPageKey), findsOneWidget);
    expect(targetPainter.paintCount, greaterThan(0));
    expect(find.byKey(_previewKey), findsOneWidget);
    expect(handoff.value, isNull);

    await tester.pump();
    expect(find.byKey(_previewKey), findsNothing);
  });

  test("a stale page-change callback cannot clear a newer preview", () {
    VoidCallback? scheduledCallback;
    final handoff = FileViewerFilmstripPreviewHandoff(
      scheduleAfterNextFramePaint: (callback) => scheduledCallback = callback,
    );
    addTearDown(handoff.dispose);
    var pagePaintedCount = 0;

    final staleFile = Object();
    handoff.beginCommit(index: 1, fileIdentity: staleFile);
    handoff.onPageChanged(
      index: 1,
      fileIdentity: staleFile,
      onPagePainted: () {
        pagePaintedCount++;
        handoff.clear();
      },
    );
    handoff.showPreview(2);
    scheduledCallback!();

    expect(pagePaintedCount, 0);
    expect(handoff.value, 2);
  });

  test("a page callback must match the committed file identity", () {
    VoidCallback? scheduledCallback;
    final handoff = FileViewerFilmstripPreviewHandoff(
      scheduleAfterNextFramePaint: (callback) => scheduledCallback = callback,
    );
    addTearDown(handoff.dispose);

    final committedFile = Object();
    final replacementFile = Object();
    handoff.beginCommit(index: 1, fileIdentity: committedFile);
    expect(
      handoff.isPendingCommit(index: 1, fileIdentity: committedFile),
      isTrue,
    );
    expect(
      handoff.isPendingCommit(index: 1, fileIdentity: replacementFile),
      isFalse,
    );
    handoff.onPageChanged(
      index: 1,
      fileIdentity: replacementFile,
      onPagePainted: handoff.clear,
    );

    expect(scheduledCallback, isNull);
    expect(handoff.value, 1);
  });
}

class _HandoffHarness extends StatelessWidget {
  final FileViewerFilmstripPreviewHandoff handoff;
  final ValueNotifier<int> committedPage;
  final CustomPainter targetPainter;

  const _HandoffHarness({
    required this.handoff,
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
                    key: _targetPageKey,
                    painter: targetPainter,
                    child: const ColoredBox(color: Colors.blue),
                  )
                : const ColoredBox(color: Colors.black),
          ),
          ValueListenableBuilder<int?>(
            valueListenable: handoff,
            builder: (context, previewIndex, _) => previewIndex == null
                ? const SizedBox.shrink()
                : Positioned.fill(
                    child: ColoredBox(
                      key: _previewKey,
                      color: Colors.grey,
                      child: Center(child: Text("Preview $previewIndex")),
                    ),
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
