import "package:ente_components/ente_components.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import 'package:path/path.dart' as path;
import "package:photos/models/file/extensions/file_props.dart";
import 'package:photos/models/file/file.dart';
import 'package:photos/models/file/file_type.dart';
import "package:photos/utils/file_util.dart";
import "package:photos/utils/magic_util.dart";

class FilePropertiesItemWidget extends StatefulWidget {
  final EnteFile file;
  final bool isImage;
  final Map<String, dynamic> exifData;
  final int currentUserID;
  const FilePropertiesItemWidget(
    this.file,
    this.isImage,
    this.exifData,
    this.currentUserID, {
    super.key,
  });
  @override
  State<FilePropertiesItemWidget> createState() =>
      _FilePropertiesItemWidgetState();
}

class _FilePropertiesItemWidgetState extends State<FilePropertiesItemWidget> {
  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final canEdit = !(widget.file.uploadedFileID == null ||
        widget.file.ownerID != widget.currentUserID ||
        widget.file.isTrash);
    final title =
        path.basenameWithoutExtension(widget.file.displayName) +
        path.extension(widget.file.displayName).toUpperCase();
    return FutureBuilder<String>(
      future: _subtitle(),
      builder: (context, snapshot) {
        return MenuComponent(
          key: const ValueKey("File properties"),
          leading: HugeIcon(
            icon: widget.isImage
                ? HugeIcons.strokeRoundedImage01
                : HugeIcons.strokeRoundedVideo02,
            size: IconSizes.small,
            color: colors.textLight,
          ),
          title: title,
          subtitle: snapshot.data,
          trailing: canEdit
              ? IconButtonComponent(
                  icon: HugeIcon(
                    icon: HugeIcons.strokeRoundedEdit02,
                    size: IconSizes.small,
                    color: colors.textLight,
                  ),
                  variant: IconButtonComponentVariant.secondary,
                  shouldSurfaceExecutionStates: false,
                  onTap: () async {
                    await editFilename(context, widget.file);
                    setState(() {});
                  },
                )
              : null,
        );
      },
    );
  }

  Future<String> _subtitle() async {
    final parts = <String>[];
    final StringBuffer dimString = StringBuffer();
    if (widget.exifData["resolution"] != null &&
        widget.exifData["megaPixels"] != null) {
      dimString.write('${widget.exifData["megaPixels"]}MP   ');
      dimString.write('${widget.exifData["resolution"]}');
    } else if (widget.file.hasDimensions) {
      final double megaPixels =
          (widget.file.width * widget.file.height) / 1000000;
      final double roundedMegaPixels = (megaPixels * 10).round() / 10.0;
      dimString.write('${roundedMegaPixels.toStringAsFixed(1)}MP   ');
      dimString.write('${widget.file.width} x ${widget.file.height}');
    }
    if (dimString.isNotEmpty) {
      parts.add(dimString.toString());
    }

    int fileSize;
    if (widget.file.fileSize != null) {
      fileSize = widget.file.fileSize!;
    } else {
      fileSize = await getFile(widget.file).then((f) => f!.length());
    }
    parts.add(formatBytes(fileSize));

    if ((widget.file.fileType == FileType.video) &&
        (widget.file.localID != null || widget.file.duration != 0)) {
      if (widget.file.duration != 0) {
        parts.add(secondsToHHMMSS(widget.file.duration!));
      } else {
        final asset = await widget.file.getAsset;
        final duration = asset?.videoDuration.toString().split(".")[0] ?? "";
        if (duration.isNotEmpty) {
          parts.add(duration);
        }
      }
    }

    return parts.join("   ");
  }
}
