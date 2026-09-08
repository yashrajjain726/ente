import "dart:collection";
import "dart:math" as math;
import "dart:typed_data";

import "package:photos/models/gallery/justified_layout.dart";

// Experimental whole-group row breaking inspired by Google Photos' FlexLayout:
// https://medium.com/google-design/google-photos-45b714dfbed1
//
// Each possible row is an edge between two file indices. A backward dynamic
// programming pass chooses the least expensive path through the entire group.
// Density is a sizing preference rather than Comfort's hard 3/4/5 item cap.
class FlexLayoutCalculator {
  static const double _minimumTappableExtent = 48;
  static const double _maximumRowHeightFactor = 1.6;
  static const double _preferredTileWidthFactor = 0.6;

  const FlexLayoutCalculator._();

  static List<JustifiedRowLayout> computeRows({
    required Iterable<double> aspectRatios,
    required double availableWidth,
    required double targetRowHeight,
    required double spacing,
  }) {
    if (!availableWidth.isFinite || availableWidth <= 0) {
      throw ArgumentError.value(availableWidth, "availableWidth");
    }
    if (!targetRowHeight.isFinite || targetRowHeight <= 0) {
      throw ArgumentError.value(targetRowHeight, "targetRowHeight");
    }
    if (!spacing.isFinite || spacing < 0) {
      throw ArgumentError.value(spacing, "spacing");
    }

    final ratios = Float64List.fromList(aspectRatios.toList(growable: false));
    if (ratios.isEmpty) return const [];
    for (var i = 0; i < ratios.length; i++) {
      final ratio = ratios[i];
      ratios[i] = ratio.isFinite && ratio > 0
          ? ratio.clamp(1 / 3, 4).toDouble()
          : 1;
    }

    final count = ratios.length;
    final costs = Float64List(count + 1)..fillRange(0, count, double.infinity);
    final nextBreak = Uint32List(count);
    final maximumHeight = targetRowHeight * _maximumRowHeightFactor;
    final preferredTileWidth = targetRowHeight * _preferredTileWidthFactor;

    double rowHeight(double fittedHeight, double minimumRatio, bool isTail) {
      if (!isTail && fittedHeight <= maximumHeight) return fittedHeight;
      // Sparse tails and unavoidable standalone portraits can leave a gap.
      // Accessibility takes precedence when a narrow portrait needs more height.
      return math.min(
        fittedHeight,
        math.max(
          targetRowHeight,
          math.max(
            _minimumTappableExtent,
            _minimumTappableExtent / minimumRatio,
          ),
        ),
      );
    }

    for (var start = count - 1; start >= 0; start--) {
      var ratioSum = 0.0;
      var minimumRatio = double.infinity;
      for (var end = start; end < count; end++) {
        ratioSum += ratios[end];
        minimumRatio = math.min(minimumRatio, ratios[end]);
        final itemCount = end - start + 1;
        final contentWidth = availableWidth - spacing * (itemCount - 1);
        if (contentWidth <= 0) break;
        final fittedHeight = contentWidth / ratioSum;
        // Adding more items only makes these extents smaller. This bounds the
        // search by the viewport's tap capacity, not the number of files.
        if (itemCount > 1 &&
            (fittedHeight < _minimumTappableExtent ||
                fittedHeight * minimumRatio < _minimumTappableExtent)) {
          break;
        }
        final isTail = end == count - 1;
        if (!isTail && itemCount > 1 && fittedHeight > maximumHeight) continue;

        final height = rowHeight(fittedHeight, minimumRatio, isTail);
        final heightDeviation = math.log(height / targetRowHeight);
        final narrowness = math.max(
          0.0,
          preferredTileWidth / (height * minimumRatio) - 1,
        );
        final unusedWidthFraction = math.max(
          0.0,
          1 - height * ratioSum / contentWidth,
        );
        // Logarithmic error treats stretching and shrinking symmetrically.
        // Weight by file count so adding more rows cannot dilute the cost.
        // A small break cost avoids fragmenting ordinary photos into many
        // standalone rows. Panoramas can still stand alone without this bias.
        final singletonPenalty = itemCount == 1 && count > 1
            ? isTail
                  ? 0.15
                  : ratios[start] < 2
                  ? 0.2
                  : 0.0
            : 0.0;
        final rowCost =
            itemCount *
                (heightDeviation * heightDeviation +
                    2 * narrowness * narrowness) +
            unusedWidthFraction * unusedWidthFraction +
            0.08 +
            singletonPenalty;
        final cost = rowCost + costs[end + 1];
        if (cost < costs[start] - 1e-9) {
          costs[start] = cost;
          nextBreak[start] = end + 1;
        }
      }
    }

    final rows = <JustifiedRowLayout>[];
    var offset = 0.0;
    for (var start = 0; start < count;) {
      final end = nextBreak[start];
      var ratioSum = 0.0;
      var minimumRatio = double.infinity;
      for (var i = start; i < end; i++) {
        ratioSum += ratios[i];
        minimumRatio = math.min(minimumRatio, ratios[i]);
      }
      final contentWidth = availableWidth - spacing * (end - start - 1);
      final fittedHeight = contentWidth / ratioSum;
      final height = rowHeight(fittedHeight, minimumRatio, end == count);
      final widths = List<double>.generate(
        end - start,
        (i) => ratios[start + i] * height,
        growable: false,
      );
      if (height == fittedHeight) {
        final precedingWidth = widths
            .take(widths.length - 1)
            .fold<double>(0, (a, b) => a + b);
        widths[widths.length - 1] = math.max(0, contentWidth - precedingWidth);
      }
      rows.add(
        JustifiedRowLayout(
          firstIndex: start,
          lastIndex: end - 1,
          minOffset: offset,
          height: height,
          itemWidths: UnmodifiableListView(widths),
        ),
      );
      offset += height + spacing;
      start = end;
    }
    return UnmodifiableListView(rows);
  }
}
