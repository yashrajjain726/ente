import "package:flutter/material.dart";
import "package:flutter/semantics.dart" show SemanticsAction;
import "package:flutter/services.dart" show SystemChannels;
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/viewer/file/file_viewer_filmstrip.dart";

void main() {
  testWidgets("centers the selected item and exposes adjustable semantics", (
    tester,
  ) async {
    final key = GlobalKey<_FilmstripHarnessState>();
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      _TestApp(
        child: _FilmstripHarness(key: key, itemCount: 20, selectedIndex: 7),
      ),
    );
    await tester.pumpAndSettle();

    _expectCentered(tester, 7);
    expect(tester.getSize(find.byKey(fileViewerFilmstripListKey)).height, 45);
    expect(
      tester.getCenter(find.byKey(const ValueKey("filmstrip-test-item-8"))).dx -
          tester
              .getCenter(find.byKey(const ValueKey("filmstrip-test-item-7")))
              .dx,
      closeTo(33, 0.01),
    );
    expect(
      tester.getSize(
        find
            .descendant(
              of: find.byKey(const ValueKey("filmstrip-test-item-7")),
              matching: find.byType(AnimatedContainer),
            )
            .first,
      ),
      const Size(34, 43),
    );
    expect(
      tester.getSize(
        find
            .descendant(
              of: find.byKey(const ValueKey("filmstrip-test-item-8")),
              matching: find.byType(AnimatedContainer),
            )
            .first,
      ),
      const Size(29, 35),
    );
    final semanticsNode = tester.getSemantics(
      find.byKey(fileViewerFilmstripKey),
    );
    final semanticsData = semanticsNode.getSemanticsData();
    expect(semanticsData.label, "Photo chooser");
    expect(semanticsData.value, "Photo 8 of 20");
    expect(semanticsData.hasAction(SemanticsAction.increase), isTrue);
    expect(semanticsData.hasAction(SemanticsAction.decrease), isTrue);

    semanticsNode.owner!.performAction(
      semanticsNode.id,
      SemanticsAction.increase,
    );
    await tester.pumpAndSettle();
    expect(key.currentState!.selections.last.index, 8);
    _expectCentered(tester, 8);

    final updatedSemanticsNode = tester.getSemantics(
      find.byKey(fileViewerFilmstripKey),
    );
    updatedSemanticsNode.owner!.performAction(
      updatedSemanticsNode.id,
      SemanticsAction.decrease,
    );
    await tester.pumpAndSettle();
    expect(key.currentState!.selections.last.index, 7);
    _expectCentered(tester, 7);
    semantics.dispose();
  });

  testWidgets("tapping a thumbnail selects and centers it", (tester) async {
    final key = GlobalKey<_FilmstripHarnessState>();
    var hapticCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == "HapticFeedback.vibrate") hapticCount++;
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await tester.pumpWidget(
      _TestApp(
        child: _FilmstripHarness(key: key, itemCount: 20, selectedIndex: 7),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey("filmstrip-test-item-8")));

    expect(key.currentState!.selections.single, (
      index: 8,
      source: FileViewerFilmstripSelectionSource.tap,
    ));
    await tester.pumpAndSettle();

    expect(key.currentState!.selections, [
      (index: 8, source: FileViewerFilmstripSelectionSource.tap),
    ]);
    expect(hapticCount, 1);
    _expectCentered(tester, 8);
  });

  testWidgets("scrubbing previews and ticks each newly centered thumbnail", (
    tester,
  ) async {
    final key = GlobalKey<_FilmstripHarnessState>();
    var hapticCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == "HapticFeedback.vibrate") hapticCount++;
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await tester.pumpWidget(
      _TestApp(
        child: _FilmstripHarness(key: key, itemCount: 20, selectedIndex: 7),
      ),
    );
    await tester.pumpAndSettle();

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(fileViewerFilmstripListKey)),
    );
    await tester.pump(const Duration(milliseconds: 200));
    // The first move starts Flutter's drag recognizer; the second one scrolls.
    await gesture.moveBy(const Offset(-20, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(-72, 0));
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      key.currentState!.selections
          .where(
            (event) =>
                event.source == FileViewerFilmstripSelectionSource.scrubStart,
          )
          .length,
      1,
    );
    final previewsBeforeUp = key.currentState!.selections
        .where(
          (event) =>
              event.source == FileViewerFilmstripSelectionSource.scrubPreview,
        )
        .toList();
    expect(previewsBeforeUp, isNotEmpty);
    expect(hapticCount, previewsBeforeUp.length);
    final previewIndex = previewsBeforeUp.last.index;
    _expectNearestToStripCenter(tester, previewIndex);

    await tester.pump(const Duration(milliseconds: 200));
    await gesture.up();
    await tester.pumpAndSettle();

    expect(hapticCount, previewsBeforeUp.length);
    expect(key.currentState!.selections.last, (
      index: previewIndex,
      source: FileViewerFilmstripSelectionSource.scrubCommit,
    ));
    expect(
      key.currentState!.selections
          .where(
            (event) =>
                event.source == FileViewerFilmstripSelectionSource.scrubCommit,
          )
          .length,
      1,
    );
    _expectCentered(tester, previewIndex);
  });

  testWidgets("a drag that stays centered still ends its scrub session", (
    tester,
  ) async {
    final key = GlobalKey<_FilmstripHarnessState>();
    var hapticCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == "HapticFeedback.vibrate") hapticCount++;
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await tester.pumpWidget(
      _TestApp(
        child: _FilmstripHarness(key: key, itemCount: 20, selectedIndex: 7),
      ),
    );
    await tester.pumpAndSettle();

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(fileViewerFilmstripListKey)),
    );
    await gesture.moveBy(const Offset(-20, 0));
    await tester.pump(const Duration(milliseconds: 200));
    await gesture.up();
    await tester.pumpAndSettle();

    expect(key.currentState!.selections, [
      (index: 7, source: FileViewerFilmstripSelectionSource.scrubStart),
      (index: 7, source: FileViewerFilmstripSelectionSource.scrubCommit),
    ]);
    expect(hapticCount, 0);
    _expectCentered(tester, 7);
  });

  testWidgets("realigns safely when the selection or item count changes", (
    tester,
  ) async {
    final key = GlobalKey<_FilmstripHarnessState>();
    var hapticCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == "HapticFeedback.vibrate") hapticCount++;
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await tester.pumpWidget(
      _TestApp(
        child: _FilmstripHarness(key: key, itemCount: 20, selectedIndex: 7),
      ),
    );
    await tester.pumpAndSettle();

    key.currentState!.update(selectedIndex: 19);
    await tester.pumpAndSettle();
    _expectCentered(tester, 19);
    expect(key.currentState!.selections, isEmpty);

    key.currentState!.update(itemCount: 4, selectedIndex: 3);
    await tester.pumpAndSettle();
    _expectCentered(tester, 3);
    expect(key.currentState!.selections, isEmpty);

    key.currentState!.update(itemCount: 0, selectedIndex: 0);
    await tester.pumpAndSettle();
    expect(find.byKey(fileViewerFilmstripListKey), findsNothing);

    key.currentState!.update(itemCount: 5, selectedIndex: 2);
    await tester.pumpAndSettle();
    _expectCentered(tester, 2);
    expect(tester.takeException(), isNull);
    expect(hapticCount, 0);
  });
}

void _expectCentered(WidgetTester tester, int index) {
  final itemCenter = tester.getCenter(
    find.byKey(ValueKey("filmstrip-test-item-$index")),
  );
  final stripCenter = tester.getCenter(find.byKey(fileViewerFilmstripListKey));
  expect(itemCenter.dx, closeTo(stripCenter.dx, 0.5));
}

void _expectNearestToStripCenter(WidgetTester tester, int index) {
  final stripCenter = tester.getCenter(find.byKey(fileViewerFilmstripListKey));
  final builtItems = find.byWidgetPredicate(
    (widget) =>
        widget.key is ValueKey<String> &&
        (widget.key! as ValueKey<String>).value.startsWith(
          "filmstrip-test-item-",
        ),
  );
  var nearestIndex = -1;
  var nearestDistance = double.infinity;
  for (final element in builtItems.evaluate()) {
    final key = element.widget.key! as ValueKey<String>;
    final itemIndex = int.parse(key.value.split("-").last);
    final distance = (tester.getCenter(find.byKey(key)).dx - stripCenter.dx)
        .abs();
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = itemIndex;
    }
  }
  expect(index, nearestIndex);
}

class _TestApp extends StatelessWidget {
  final Widget child;

  const _TestApp({required this.child});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: SizedBox(width: 380, child: child)),
      ),
    );
  }
}

class _FilmstripHarness extends StatefulWidget {
  final int itemCount;
  final int selectedIndex;

  const _FilmstripHarness({
    required this.itemCount,
    required this.selectedIndex,
    super.key,
  });

  @override
  State<_FilmstripHarness> createState() => _FilmstripHarnessState();
}

class _FilmstripHarnessState extends State<_FilmstripHarness> {
  late int itemCount = widget.itemCount;
  late int selectedIndex = widget.selectedIndex;
  final selections =
      <({int index, FileViewerFilmstripSelectionSource source})>[];

  void update({int? itemCount, int? selectedIndex}) {
    setState(() {
      this.itemCount = itemCount ?? this.itemCount;
      this.selectedIndex = selectedIndex ?? this.selectedIndex;
    });
  }

  @override
  Widget build(BuildContext context) {
    return FileViewerFilmstrip(
      itemCount: itemCount,
      selectedIndex: selectedIndex,
      semanticLabel: "Photo chooser",
      semanticValueBuilder: (current, total) => "Photo $current of $total",
      itemKeyBuilder: (index) => ValueKey("filmstrip-test-item-$index"),
      itemBuilder: (context, index) =>
          ColoredBox(color: Color(0xFF000000 + index)),
      onSelectionChanged: (index, source) {
        selections.add((index: index, source: source));
        if (source == FileViewerFilmstripSelectionSource.tap ||
            source == FileViewerFilmstripSelectionSource.scrubCommit) {
          setState(() => selectedIndex = index);
        }
      },
    );
  }
}
