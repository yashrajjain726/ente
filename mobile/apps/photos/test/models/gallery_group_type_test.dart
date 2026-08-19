import "package:flutter_test/flutter_test.dart";
import "package:photos/models/file/file.dart";
import "package:photos/ui/viewer/gallery/component/group/type.dart";

void main() {
  group("week group range", () {
    test("includes Monday through the final microsecond of Sunday", () {
      final monday = DateTime(2026, 8, 17);
      final nextMonday = DateTime(2026, 8, 24);
      final sundayFinalMicrosecond = nextMonday.subtract(
        const Duration(microseconds: 1),
      );

      final range = GroupType.week.getGroupRange(
        _fileAt(sundayFinalMicrosecond),
      );

      expect(range, (
        monday.microsecondsSinceEpoch,
        sundayFinalMicrosecond.microsecondsSinceEpoch,
      ));
    });

    test("excludes the previous Sunday and following Monday", () {
      final monday = DateTime(2026, 8, 17);
      final previousSundayFinalMicrosecond = monday.subtract(
        const Duration(microseconds: 1),
      );
      final nextMonday = DateTime(2026, 8, 24);
      final range = GroupType.week.getGroupRange(_fileAt(monday));

      expect(
        previousSundayFinalMicrosecond.microsecondsSinceEpoch,
        lessThan(range.$1),
      );
      expect(nextMonday.microsecondsSinceEpoch, greaterThan(range.$2));
    });

    test("groups Monday morning and Sunday evening together", () {
      final mondayMorning = DateTime(2026, 8, 17, 9);
      final sundayEvening = DateTime(2026, 8, 23, 18);

      expect(
        GroupType.week.getGroupRange(_fileAt(mondayMorning)),
        GroupType.week.getGroupRange(_fileAt(sundayEvening)),
      );
    });

    test("normalizes weeks across year boundaries", () {
      final sunday = DateTime(2026, 1, 4, 23, 59, 59, 999, 999);
      final range = GroupType.week.getGroupRange(_fileAt(sunday));

      expect(range, (
        DateTime(2025, 12, 29).microsecondsSinceEpoch,
        DateTime(2026, 1, 5).microsecondsSinceEpoch - 1,
      ));
    });
  });
}

EnteFile _fileAt(DateTime date) {
  return EnteFile()..creationTime = date.microsecondsSinceEpoch;
}
