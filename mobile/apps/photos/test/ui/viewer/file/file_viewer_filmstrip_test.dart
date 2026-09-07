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
    expect(_thumbnailSize(tester, 7), const Size(34, 43));
    expect(_thumbnailSize(tester, 8), const Size(29, 35));
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

  testWidgets("a tap selects immediately and keeps the size animation", (
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

    await tester.tap(find.byKey(const ValueKey("filmstrip-test-item-8")));

    expect(key.currentState!.selections.single, (
      index: 8,
      source: FileViewerFilmstripSelectionSource.tap,
    ));
    expect(_thumbnailSize(tester, 8), const Size(29, 35));
    await tester.pump();
    expect(_thumbnailSize(tester, 8), const Size(29, 35));
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump(const Duration(milliseconds: 60));
    final transitioningSize = _thumbnailSize(tester, 8);
    expect(transitioningSize.width, inExclusiveRange(29, 34));
    expect(transitioningSize.height, inExclusiveRange(35, 43));
    await tester.pumpAndSettle();

    expect(key.currentState!.selections, [
      (index: 8, source: FileViewerFilmstripSelectionSource.tap),
    ]);
    expect(hapticCount, 1);
    _expectCentered(tester, 8);
    expect(_thumbnailSize(tester, 8), const Size(34, 43));
  });

  testWidgets("sizes thumbnails continuously by their distance from center", (
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

    final position = _filmstripPosition(tester);
    final initialOffset = position.pixels;
    final itemPitch =
        tester
            .getCenter(find.byKey(const ValueKey("filmstrip-test-item-8")))
            .dx -
        tester
            .getCenter(find.byKey(const ValueKey("filmstrip-test-item-7")))
            .dx;
    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(fileViewerFilmstripListKey)),
    );
    await gesture.moveBy(const Offset(-20, 0));
    await tester.pump();

    Future<void> moveTo(double itemFraction) async {
      final targetOffset = initialOffset + (itemPitch * itemFraction);
      await gesture.moveBy(Offset(position.pixels - targetOffset, 0));
      await tester.pump();
    }

    await moveTo(0.25);
    final outgoingAt25 = _thumbnailSize(tester, 7);
    final incomingAt25 = _thumbnailSize(tester, 8);
    expect(outgoingAt25.width, inExclusiveRange(29, 34));
    expect(incomingAt25.width, inExclusiveRange(29, outgoingAt25.width));
    expect(key.currentState!.selections.map((event) => event.source), [
      FileViewerFilmstripSelectionSource.scrubStart,
    ]);
    expect(hapticCount, 0);

    await moveTo(0.45);
    final outgoingAt45 = _thumbnailSize(tester, 7);
    final incomingAt45 = _thumbnailSize(tester, 8);
    expect(outgoingAt45.width, lessThan(outgoingAt25.width));
    expect(incomingAt45.width, greaterThan(incomingAt25.width));
    expect(hapticCount, 0);

    await moveTo(0.55);
    final outgoingAt55 = _thumbnailSize(tester, 7);
    final incomingAt55 = _thumbnailSize(tester, 8);
    expect(outgoingAt55.width, lessThan(outgoingAt45.width));
    expect(incomingAt55.width, greaterThan(incomingAt45.width));
    expect((outgoingAt55.width - outgoingAt45.width).abs(), lessThan(2));
    expect((incomingAt55.width - incomingAt45.width).abs(), lessThan(2));
    expect(key.currentState!.selections.last, (
      index: 8,
      source: FileViewerFilmstripSelectionSource.scrubPreview,
    ));
    expect(hapticCount, 1);

    await moveTo(0.75);
    expect(_thumbnailSize(tester, 7).width, lessThan(outgoingAt55.width));
    expect(_thumbnailSize(tester, 8).width, greaterThan(incomingAt55.width));
    expect(hapticCount, 1);

    await tester.pump(const Duration(milliseconds: 200));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(key.currentState!.selections.last, (
      index: 8,
      source: FileViewerFilmstripSelectionSource.scrubCommit,
    ));
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
    // The first move starts Flutter's drag recognizer; the second one scrolls.
    await gesture.moveBy(const Offset(-20, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(-33, 0));
    await tester.pump();

    expect(
      key.currentState!.selections
          .where(
            (event) =>
                event.source == FileViewerFilmstripSelectionSource.scrubStart,
          )
          .length,
      1,
    );
    var previewsBeforeUp = key.currentState!.selections
        .where(
          (event) =>
              event.source == FileViewerFilmstripSelectionSource.scrubPreview,
        )
        .toList();
    expect(previewsBeforeUp.map((event) => event.index), [8]);
    expect(hapticCount, 1);
    _expectNearestToStripCenter(tester, 8);

    await gesture.moveBy(const Offset(-33, 0));
    await tester.pump();

    previewsBeforeUp = key.currentState!.selections
        .where(
          (event) =>
              event.source == FileViewerFilmstripSelectionSource.scrubPreview,
        )
        .toList();
    expect(previewsBeforeUp.map((event) => event.index), [8, 9]);
    expect(hapticCount, 2);

    await gesture.moveBy(const Offset(33, 0));
    await tester.pump();

    previewsBeforeUp = key.currentState!.selections
        .where(
          (event) =>
              event.source == FileViewerFilmstripSelectionSource.scrubPreview,
        )
        .toList();
    expect(previewsBeforeUp.map((event) => event.index), [8, 9, 8]);
    expect(hapticCount, 3);

    final previewIndex = previewsBeforeUp.last.index;
    _expectNearestToStripCenter(tester, previewIndex);

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

  testWidgets("raises the fling cap and extends its coast", (tester) async {
    await tester.pumpWidget(
      const _TestApp(child: _FilmstripHarness(itemCount: 20, selectedIndex: 7)),
    );
    await tester.pumpAndSettle();

    final position = _filmstripPosition(tester);
    final physics = position.physics;
    expect(physics.maxFlingVelocity, 800);
    expect(physics.carriedMomentum(5000), 0);

    final cappedSimulation = physics.createBallisticSimulation(position, 5000);
    expect(cappedSimulation, isNotNull);
    expect(cappedSimulation!.dx(0).abs(), lessThanOrEqualTo(800.01));

    final tunedSimulation = physics.createBallisticSimulation(position, 500)!;
    final baselineSimulation = physics.parent!.createBallisticSimulation(
      position,
      500,
    )!;
    expect(tunedSimulation.dx(0), closeTo(baselineSimulation.dx(0), 0.01));
    expect(
      tunedSimulation.dx(0.25).abs(),
      greaterThan(baselineSimulation.dx(0.25).abs()),
    );
    final tunedSettlingTime = _settlingTime(tunedSimulation, start: 0.25);
    final baselineSettlingTime = _settlingTime(baselineSimulation, start: 0.25);
    expect(
      tunedSettlingTime / baselineSettlingTime,
      inInclusiveRange(1.7, 2.0),
    );
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

Size _thumbnailSize(WidgetTester tester, int index) {
  return tester.getSize(
    find.byKey(ValueKey("filmstrip-test-thumbnail-$index")),
  );
}

ScrollPosition _filmstripPosition(WidgetTester tester) {
  return tester
      .state<ScrollableState>(
        find.descendant(
          of: find.byKey(fileViewerFilmstripListKey),
          matching: find.byType(Scrollable),
        ),
      )
      .position;
}

double _settlingTime(Simulation simulation, {required double start}) {
  var time = start;
  while (!simulation.isDone(time) && time < 10) {
    time += 0.01;
  }
  return time;
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
      itemBuilder: (context, index) => ColoredBox(
        key: ValueKey("filmstrip-test-thumbnail-$index"),
        color: Color(0xFF000000 + index),
      ),
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
