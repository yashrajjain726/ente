import "package:flutter/widgets.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/models/gallery/mosaic_layout.dart";

void main() {
  group("MosaicLayoutCalculator", () {
    test("uses a square fallback for missing or invalid dimensions", () {
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(0, 0), 1);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(0, 100), 1);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(100, 0), 1);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(-100, 50), 1);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(100, -50), 1);
    });

    test("preserves normal ratios and clamps extreme dimensions", () {
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(4, 3), 4 / 3);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(1, 100), 1 / 3);
      expect(MosaicLayoutCalculator.aspectRatioForDimensions(100, 1), 4);
    });

    test("normalizes invalid and extreme input ratios", () {
      final rows = MosaicLayoutCalculator.computeRows(
        aspectRatios: [
          double.nan,
          double.infinity,
          double.negativeInfinity,
          -1,
          0,
          1e-9,
          1e9,
        ],
        availableWidth: 400,
        targetRowHeight: 100,
        spacing: 2,
      );

      expect(rows.first.firstIndex, 0);
      expect(rows.last.lastIndex, 6);
      for (final row in rows) {
        expect(row.height.isFinite, isTrue);
        expect(row.height, greaterThan(0));
        for (final width in row.itemWidths) {
          expect(width.isFinite, isTrue);
          expect(width, greaterThan(0));
        }
      }
    });

    test("justified rows conserve the full available width", () {
      const availableWidth = 400.0;
      const spacing = 2.0;
      final rows = MosaicLayoutCalculator.computeRows(
        aspectRatios: const [1, 1, 1, 1],
        availableWidth: availableWidth,
        targetRowHeight: 100,
        spacing: spacing,
      );

      expect(rows, hasLength(1));
      final row = rows.single;
      final occupiedWidth =
          row.itemWidths.fold<double>(0, (sum, width) => sum + width) +
          spacing * (row.itemWidths.length - 1);
      expect(occupiedWidth, closeTo(availableWidth, 1e-9));
      expect(row.itemWidths, everyElement(closeTo(98.5, 1e-9)));
    });

    test("the final incomplete row does not grow past the target height", () {
      const availableWidth = 400.0;
      const targetRowHeight = 100.0;
      const spacing = 2.0;
      final rows = MosaicLayoutCalculator.computeRows(
        aspectRatios: const [1, 1],
        availableWidth: availableWidth,
        targetRowHeight: targetRowHeight,
        spacing: spacing,
      );

      expect(rows, hasLength(1));
      final row = rows.single;
      expect(row.height, targetRowHeight);
      expect(row.itemWidths, everyElement(row.height));
      final occupiedWidth =
          row.itemWidths.fold<double>(0, (sum, width) => sum + width) + spacing;
      expect(occupiedWidth, lessThanOrEqualTo(availableWidth));
    });

    test("a sparse portrait final row remains ragged at target height", () {
      const availableWidth = 400.0;
      const targetRowHeight = 100.0;
      final rows = MosaicLayoutCalculator.computeRows(
        aspectRatios: const [0.25],
        availableWidth: availableWidth,
        targetRowHeight: targetRowHeight,
        spacing: 2,
      );

      expect(rows, hasLength(1));
      final row = rows.single;
      expect(row.height, targetRowHeight);
      expect(row.itemWidths.single / row.height, closeTo(1 / 3, 1e-9));
      expect(row.itemWidths.single, lessThan(availableWidth));
    });

    test("does not squeeze an extreme item into a mixed row", () {
      for (final ratios in const [
        [0.25, 4.0],
        [4.0, 0.25],
      ]) {
        final rows = MosaicLayoutCalculator.computeRows(
          aspectRatios: ratios,
          availableWidth: 430,
          targetRowHeight: 106,
          spacing: 2,
        );

        expect(rows, hasLength(2));
        expect(rows.first.lastIndex, 0);
        expect(rows.last.firstIndex, 1);
      }
    });

    test("lays out 100k ratios quickly and deterministically", () {
      final ratios = List<double>.generate(100000, (index) {
        return switch (index % 8) {
          0 => 0.25,
          1 => 0.5,
          2 => 0.75,
          3 => 1,
          4 => 4 / 3,
          5 => 1.5,
          6 => 2,
          _ => 4,
        };
      }, growable: false);

      final stopwatch = Stopwatch()..start();
      final first = MosaicLayoutCalculator.computeRows(
        aspectRatios: ratios,
        availableWidth: 430,
        targetRowHeight: 105,
        spacing: 2,
      );
      stopwatch.stop();

      expect(stopwatch.elapsed, lessThan(const Duration(seconds: 5)));
      expect(first, isNotEmpty);
      expect(first.first.firstIndex, 0);
      expect(first.last.lastIndex, ratios.length - 1);
      _expectValidRows(first, itemCount: ratios.length, spacing: 2);

      final second = MosaicLayoutCalculator.computeRows(
        aspectRatios: ratios,
        availableWidth: 430,
        targetRowHeight: 105,
        spacing: 2,
      );
      _expectSameRows(first, second);
    });
  });

  group("MosaicSectionLayout", () {
    const rows = [
      MosaicRowLayout(
        firstIndex: 0,
        lastIndex: 1,
        minOffset: 0,
        height: 10,
        itemWidths: [40, 40],
      ),
      MosaicRowLayout(
        firstIndex: 2,
        lastIndex: 2,
        minOffset: 12,
        height: 20,
        itemWidths: [80],
      ),
      MosaicRowLayout(
        firstIndex: 3,
        lastIndex: 4,
        minOffset: 34,
        height: 30,
        itemWidths: [30, 50],
      ),
    ];
    final section = MosaicSectionLayout(
      firstIndex: 10,
      lastIndex: 13,
      minOffset: 100,
      maxOffset: 169,
      headerExtent: 5,
      spacing: 2,
      rows: rows,
      builder: (context, index) => const SizedBox.shrink(),
    );

    test("maps header and row indices to exact layout offsets", () {
      expect(section.indexToLayoutOffset(10), 100);
      expect(section.indexToLayoutOffset(11), 105);
      expect(section.indexToLayoutOffset(12), 117);
      expect(section.indexToLayoutOffset(13), 139);
      expect(section.indexToLayoutOffset(14), 171);
    });

    test("finds the first child at row and spacing boundaries", () {
      expect(section.getMinChildIndexForScrollOffset(100), 10);
      expect(section.getMinChildIndexForScrollOffset(104.999), 10);
      expect(section.getMinChildIndexForScrollOffset(105), 11);
      expect(section.getMinChildIndexForScrollOffset(115), 11);
      expect(section.getMinChildIndexForScrollOffset(116.999), 11);
      expect(section.getMinChildIndexForScrollOffset(117), 12);
      expect(section.getMinChildIndexForScrollOffset(139), 13);
      expect(section.getMinChildIndexForScrollOffset(169), 13);
    });

    test(
      "finds the last child without including a row at its leading edge",
      () {
        expect(section.getMaxChildIndexForScrollOffset(100), 10);
        expect(section.getMaxChildIndexForScrollOffset(105), 10);
        expect(section.getMaxChildIndexForScrollOffset(105.001), 11);
        expect(section.getMaxChildIndexForScrollOffset(117), 11);
        expect(section.getMaxChildIndexForScrollOffset(117.001), 12);
        expect(section.getMaxChildIndexForScrollOffset(139), 12);
        expect(section.getMaxChildIndexForScrollOffset(139.001), 13);
        expect(section.getMaxChildIndexForScrollOffset(169), 13);
      },
    );
  });
}

void _expectValidRows(
  List<MosaicRowLayout> rows, {
  required int itemCount,
  required double spacing,
}) {
  var expectedFirstIndex = 0;
  var expectedOffset = 0.0;
  for (final row in rows) {
    expect(row.firstIndex, expectedFirstIndex);
    expect(row.lastIndex, greaterThanOrEqualTo(row.firstIndex));
    expect(row.itemWidths, hasLength(row.lastIndex - row.firstIndex + 1));
    expect(row.minOffset, closeTo(expectedOffset, 1e-9));
    expect(row.height.isFinite, isTrue);
    expect(row.height, greaterThan(0));
    expectedFirstIndex = row.lastIndex + 1;
    expectedOffset = row.maxOffset + spacing;
  }
  expect(expectedFirstIndex, itemCount);
}

void _expectSameRows(
  List<MosaicRowLayout> first,
  List<MosaicRowLayout> second,
) {
  expect(second, hasLength(first.length));
  for (var index = 0; index < first.length; index++) {
    final firstRow = first[index];
    final secondRow = second[index];
    expect(secondRow.firstIndex, firstRow.firstIndex, reason: "row $index");
    expect(secondRow.lastIndex, firstRow.lastIndex, reason: "row $index");
    expect(secondRow.minOffset, firstRow.minOffset, reason: "row $index");
    expect(secondRow.height, firstRow.height, reason: "row $index");
    expect(secondRow.itemWidths, firstRow.itemWidths, reason: "row $index");
  }
}
