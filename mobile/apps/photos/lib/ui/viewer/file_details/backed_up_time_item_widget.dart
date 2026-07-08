import "package:ente_components/ente_components.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:intl/intl.dart";
import 'package:photos/models/file/file.dart';

class BackedUpTimeItemWidget extends StatelessWidget {
  final EnteFile file;
  const BackedUpTimeItemWidget(this.file, {super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final dateTimeForUpdationTime = DateTime.fromMicrosecondsSinceEpoch(
      file.updationTime!,
    );
    return MenuComponent(
      key: const ValueKey("Backedup date"),
      leading: HugeIcon(
        icon: HugeIcons.strokeRoundedCloudUpload,
        size: IconSizes.small,
        color: colors.textLight,
      ),
      title: DateFormat.yMMMEd(
        Localizations.localeOf(context).languageCode,
      ).format(dateTimeForUpdationTime),
      subtitle:
          getTimeIn12hrFormat(dateTimeForUpdationTime) +
          "  " +
          dateTimeForUpdationTime.timeZoneName,
    );
  }
}
