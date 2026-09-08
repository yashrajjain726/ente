import "package:flutter_test/flutter_test.dart";
import "package:photos/models/gallery/flex_layout.dart";

void main() {
  test("considers later photos when choosing an earlier row break", () {
    List<int> rowCounts(List<double> ratios) =>
        FlexLayoutCalculator.computeRows(
          aspectRatios: ratios,
          availableWidth: 402,
          targetRowHeight: 200,
          spacing: 2,
        ).map((row) => row.itemWidths.length).toList();

    expect(rowCounts([1.5, 0.5, 0.5]), [1, 2]);
    expect(rowCounts([1.5, 0.5, 0.5, 0.5, 0.5]), [2, 3]);
  });

  test("can exceed Comfort's item cap to avoid a portrait orphan", () {
    final rows = FlexLayoutCalculator.computeRows(
      aspectRatios: List.filled(4, 9 / 16),
      availableWidth: 402,
      targetRowHeight: 200,
      spacing: 2,
    );
    expect(rows, hasLength(1));
    expect(rows.single.itemWidths, hasLength(4));
    expect(
      rows.single.itemWidths.reduce((a, b) => a + b) + 6,
      closeTo(402, 1e-9),
    );
  });

  test("keeps dense portraits balanced and sparse tablet tails restrained", () {
    final portraits = FlexLayoutCalculator.computeRows(
      aspectRatios: List.filled(9, 9 / 16),
      availableWidth: 402,
      targetRowHeight: 200,
      spacing: 2,
    );
    expect(portraits.map((row) => row.itemWidths.length), [3, 3, 3]);
    final tail = FlexLayoutCalculator.computeRows(
      aspectRatios: const [0.75, 0.75],
      availableWidth: 1024,
      targetRowHeight: 320,
      spacing: 2,
    ).single;
    expect(tail.height, 320);
    expect(tail.itemWidths.reduce((a, b) => a + b) + 2, lessThan(1024));
  });

  test("preserves file order, ratios and tap extents across screen sizes", () {
    const ratios = [1 / 3, 4.0, 0.85, 4.0, 1.0, 0.75, 1.5, 0.5, 1.0];
    for (final width in [393.0, 744.0, 1024.0, 1366.0]) {
      final rows = FlexLayoutCalculator.computeRows(
        aspectRatios: ratios,
        availableWidth: width,
        targetRowHeight: width < 600 ? 195.5 : 320,
        spacing: 2,
      );
      var fileIndex = 0;
      var offset = 0.0;
      for (final row in rows) {
        expect(row.firstIndex, fileIndex);
        expect(row.minOffset, closeTo(offset, 1e-9));
        expect(row.height, greaterThanOrEqualTo(48));
        expect(row.itemWidths, everyElement(greaterThanOrEqualTo(48 - 1e-9)));
        for (final tileWidth in row.itemWidths) {
          expect(tileWidth / row.height, closeTo(ratios[fileIndex++], 1e-9));
        }
        expect(row.lastIndex, fileIndex - 1);
        expect(
          row.itemWidths.reduce((a, b) => a + b) +
              2 * (row.itemWidths.length - 1),
          lessThanOrEqualTo(width + 1e-9),
        );
        offset = row.maxOffset + 2;
      }
      expect(fileIndex, ratios.length);
    }
  });

  test("normalizes missing and extreme ratios and handles empty groups", () {
    final rows = FlexLayoutCalculator.computeRows(
      aspectRatios: [0, double.nan, double.infinity, 0.01, 100],
      availableWidth: 744,
      targetRowHeight: 320,
      spacing: 2,
    );
    expect(
      rows.expand((row) => row.itemWidths.map((width) => width / row.height)),
      orderedEquals(
        [1.0, 1.0, 1.0, 1 / 3, 4.0].map((ratio) => closeTo(ratio, 1e-9)),
      ),
    );
    expect(
      FlexLayoutCalculator.computeRows(
        aspectRatios: [],
        availableWidth: 402,
        targetRowHeight: 200,
        spacing: 2,
      ),
      isEmpty,
    );
  });
}
