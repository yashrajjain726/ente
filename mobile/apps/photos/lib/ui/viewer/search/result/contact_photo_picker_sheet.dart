import "dart:math" as math;

import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/file_load_result.dart";
import "package:photos/models/selected_files.dart";
import "package:photos/services/search_service.dart";
import "package:photos/theme/colors.dart";
import "package:photos/ui/viewer/gallery/gallery.dart";
import "package:photos/ui/viewer/gallery/state/gallery_files_inherited_widget.dart";

sealed class ContactPhotoPickerResult {
  const ContactPhotoPickerResult();
}

class ContactPhotoPickerFile extends ContactPhotoPickerResult {
  const ContactPhotoPickerFile(this.file);

  final EnteFile file;
}

class ContactPhotoPickerRemove extends ContactPhotoPickerResult {
  const ContactPhotoPickerRemove();
}

Future<ContactPhotoPickerResult?> showContactPhotoPickerSheet(
  BuildContext context, {
  required bool canRemovePhoto,
}) {
  return showBottomSheetComponent<ContactPhotoPickerResult>(
    context: context,
    barrierColor: backdropFaintDark,
    enableDrag: true,
    builder: (context) =>
        _ContactPhotoPickerSheet(canRemovePhoto: canRemovePhoto),
  );
}

class _ContactPhotoPickerSheet extends StatefulWidget {
  const _ContactPhotoPickerSheet({required this.canRemovePhoto});

  final bool canRemovePhoto;

  @override
  State<_ContactPhotoPickerSheet> createState() =>
      _ContactPhotoPickerSheetState();
}

class _ContactPhotoPickerSheetState extends State<_ContactPhotoPickerSheet> {
  late final ValueNotifier<bool> _isFileSelected;
  late final SelectedFiles _selectedFiles;

  @override
  void initState() {
    super.initState();
    _isFileSelected = ValueNotifier(false);
    _selectedFiles = SelectedFiles()..addListener(_handleSelectionChanged);
  }

  @override
  void dispose() {
    _selectedFiles
      ..removeListener(_handleSelectionChanged)
      ..dispose();
    _isFileSelected.dispose();
    super.dispose();
  }

  void _handleSelectionChanged() {
    _isFileSelected.value = _selectedFiles.files.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.componentColors;
    final screenHeight = MediaQuery.sizeOf(context).height;
    final sheetHeight = math.min(screenHeight * 0.78, screenHeight - 80);

    return Container(
      height: sheetHeight,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.backgroundBase,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(Radii.bottomSheet),
        ),
        border: Border.all(color: colors.strokeDark),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            _ContactPhotoSheetHeader(title: l10n.setAContactPhoto),
            Expanded(
              child: GalleryFilesState(
                child: Gallery(
                  asyncLoader:
                      (creationStartTime, creationEndTime, {limit, asc}) async {
                        final files = await SearchService.instance
                            .getAllFilesForContactPhotoPicker();
                        return FileLoadResult(files, false);
                      },
                  tagPrefix: "pick_contact_photo_gallery",
                  selectedFiles: _selectedFiles,
                  limitSelectionToOne: true,
                  showSelectAll: false,
                  disablePinnedGroupHeader: true,
                  disableVerticalPaddingForScrollbar: true,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Spacing.xl,
                Spacing.lg,
                Spacing.xl,
                Spacing.xl,
              ),
              child: ValueListenableBuilder<bool>(
                valueListenable: _isFileSelected,
                builder: (context, value, _) {
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _ContactPhotoSheetButton(
                        label: l10n.setSelectedPhoto,
                        isDisabled: !value,
                        backgroundColor: colors.primary,
                        disabledBackgroundColor: colors.fillDark,
                        foregroundColor: colors.specialWhite,
                        disabledForegroundColor: colors.textLightest,
                        onTap: () {
                          Navigator.pop(
                            context,
                            ContactPhotoPickerFile(_selectedFiles.files.first),
                          );
                        },
                      ),
                      if (widget.canRemovePhoto) ...[
                        const SizedBox(height: Spacing.md),
                        _ContactPhotoSheetButton(
                          label: l10n.removeContactPhoto,
                          backgroundColor: colors.fillDark,
                          foregroundColor: colors.textBase,
                          onTap: () {
                            Navigator.pop(
                              context,
                              const ContactPhotoPickerRemove(),
                            );
                          },
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactPhotoSheetHeader extends StatelessWidget {
  const _ContactPhotoSheetHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        Spacing.xl,
        Spacing.xl,
        Spacing.xl,
        Spacing.lg,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyles.h1.copyWith(color: colors.textBase),
            ),
          ),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.fillLight,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.close, color: colors.textLightest, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactPhotoSheetButton extends StatelessWidget {
  const _ContactPhotoSheetButton({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.onTap,
    this.disabledBackgroundColor,
    this.disabledForegroundColor,
    this.isDisabled = false,
  });

  final String label;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color? disabledBackgroundColor;
  final Color? disabledForegroundColor;
  final VoidCallback onTap;
  final bool isDisabled;

  @override
  Widget build(BuildContext context) {
    final enabled = !isDisabled;
    final effectiveBackground = enabled
        ? backgroundColor
        : disabledBackgroundColor ?? backgroundColor;
    final effectiveForeground = enabled
        ? foregroundColor
        : disabledForegroundColor ?? foregroundColor;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: Container(
        width: double.infinity,
        height: 48,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: Spacing.xxl),
        decoration: BoxDecoration(
          color: effectiveBackground,
          borderRadius: BorderRadius.circular(Radii.button),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyles.body.copyWith(color: effectiveForeground),
        ),
      ),
    );
  }
}
