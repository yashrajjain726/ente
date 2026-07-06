import "dart:typed_data";

import "package:ente_components/ente_components.dart";
import "package:ente_contacts/contacts.dart" as contacts;
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/material.dart";
import "package:logging/logging.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/file/file.dart";
import "package:photos/services/photos_contacts_service.dart";
import "package:photos/theme/ente_theme.dart";
import "package:photos/ui/common/loading_widget.dart";
import "package:photos/ui/components/action_sheet_widget.dart";
import "package:photos/ui/components/buttons/button_widget.dart";
import "package:photos/ui/components/models/button_type.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/ui/viewer/people/face_thumbnail_squircle.dart";
import "package:photos/ui/viewer/search/result/contact_photo_adjust_page.dart";
import "package:photos/ui/viewer/search/result/contact_photo_picker_sheet.dart";
import "package:photos/utils/contact_photo_util.dart";
import "package:photos/utils/dialog_util.dart";
import "package:photos/utils/thumbnail_util.dart";

class EditContactPage extends StatefulWidget {
  final int contactUserId;
  final String email;
  final contacts.ContactRecord? existingContact;

  const EditContactPage({
    required this.contactUserId,
    required this.email,
    required this.existingContact,
    super.key,
  });

  @override
  State<EditContactPage> createState() => _EditContactPageState();
}

class _EditContactPageState extends State<EditContactPage> {
  static const _avatarSize = 108.0;
  static const _editBadgeSize = 32.0;

  final _logger = Logger("EditContactPage");
  late final TextEditingController _nameController;
  late final FocusNode _nameFocusNode;
  late final String? _birthDateToPreserve;
  bool _isSaving = false;
  bool _isLoadingPhoto = false;
  bool _photoDirty = false;
  Uint8List? _draftPhotoBytes;
  int _photoLoadGeneration = 0;

  @override
  void initState() {
    super.initState();
    _nameController =
        TextEditingController(text: widget.existingContact?.data?.name ?? "")
          ..addListener(() {
            if (mounted) {
              setState(() {});
            }
          });
    _nameFocusNode = FocusNode()
      ..addListener(() {
        if (mounted) {
          setState(() {});
        }
      });
    _birthDateToPreserve = widget.existingContact?.data?.birthDate;
    _loadExistingPhoto();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _nameFocusNode.dispose();
    super.dispose();
  }

  bool get _canSave => !_isSaving && _nameController.text.trim().isNotEmpty;
  String get _initialName => (widget.existingContact?.data?.name ?? "").trim();
  bool get _hasUnsavedChanges =>
      _nameController.text.trim() != _initialName || _photoDirty;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final l10n = AppLocalizations.of(context);

    return PopScope(
      canPop: !_isSaving && !_hasUnsavedChanges,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop || _isSaving || !_hasUnsavedChanges) {
          return;
        }

        final action = await _showExitConfirmationDialog(context);
        if (!mounted || action == null || action == ButtonAction.cancel) {
          return;
        }

        if (_canSave && action == ButtonAction.first) {
          await _saveContact();
          return;
        }

        final shouldPop = _canSave
            ? action == ButtonAction.second
            : action == ButtonAction.first;
        if (shouldPop && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        backgroundColor: colors.backgroundBase,
        body: Column(
          children: [
            _EditContactHeader(
              title: l10n.editContact,
              onBack: () {
                Navigator.of(context).maybePop();
              },
            ),
            Expanded(
              child: ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
                children: [
                  Center(
                    child: SizedBox(
                      width: _avatarSize,
                      height: _avatarSize,
                      child: GestureDetector(
                        onTap: _pickContactPhoto,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            _buildAvatar(context, size: _avatarSize),
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: _AvatarEditButton(
                                size: _editBadgeSize,
                                onTap: _pickContactPhoto,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  _ReadOnlyContactTextInput(
                    label: l10n.email,
                    value: widget.email,
                  ),
                  const SizedBox(height: 20),
                  TextInputComponent(
                    label: l10n.name,
                    hintText: l10n.enterName,
                    controller: _nameController,
                    focusNode: _nameFocusNode,
                    isRequired: true,
                    textCapitalization: TextCapitalization.words,
                    onSubmit: _canSave ? (_) => _saveContact() : null,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
              child: _ContactSaveButton(
                label: l10n.saveContact,
                isDisabled: !_canSave,
                onTap: _canSave ? _saveContact : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(BuildContext context, {required double size}) {
    final colorScheme = getEnteColorScheme(context);
    final textTheme = getEnteTextTheme(context);
    final trimmedName = _nameController.text.trim();
    final initial = trimmedName.isNotEmpty
        ? trimmedName.characters.first.toUpperCase()
        : widget.email.characters.first.toUpperCase();
    final avatarSeed = trimmedName.isNotEmpty ? trimmedName : widget.email;
    final avatarColor =
        colorScheme.avatarColors[avatarSeed.length.remainder(
          colorScheme.avatarColors.length,
        )];

    if (_isLoadingPhoto) {
      return _ContactThumbnailShell(
        size: size,
        backgroundColor: colorScheme.fillFaint,
        child: const Center(child: EnteLoadingWidget()),
      );
    }

    if (_draftPhotoBytes != null) {
      return _ContactThumbnailShell(
        size: size,
        child: Image.memory(_draftPhotoBytes!, fit: BoxFit.cover),
      );
    }

    return _ContactThumbnailShell(
      size: size,
      backgroundColor: avatarColor,
      child: Center(
        child: Text(
          initial,
          style: textTheme.h1Bold.copyWith(
            fontSize: 38.25,
            height: 47.813 / 38.25,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Future<void> _loadExistingPhoto() async {
    final existing = widget.existingContact;
    if (existing?.profilePictureAttachmentId == null) {
      return;
    }
    final loadGeneration = ++_photoLoadGeneration;
    setState(() {
      _isLoadingPhoto = true;
    });
    final bytes = await PhotosContactsService.instance
        .getProfilePictureBytesByUserId(widget.contactUserId);
    if (!mounted || loadGeneration != _photoLoadGeneration) {
      return;
    }
    if (_photoDirty || _draftPhotoBytes != null) {
      setState(() {
        _isLoadingPhoto = false;
      });
      return;
    }
    setState(() {
      _draftPhotoBytes = bytes;
      _isLoadingPhoto = false;
      _photoDirty = false;
    });
  }

  Future<void> _pickContactPhoto() async {
    final selectedFile = await showContactPhotoPickerSheet(context);
    if (selectedFile == null) {
      return;
    }
    setState(() {
      _isLoadingPhoto = true;
    });
    final sourceBytes = await _loadEditablePhotoBytesFromFile(selectedFile);
    if (!mounted) {
      return;
    }
    setState(() {
      _isLoadingPhoto = false;
    });
    if (sourceBytes == null) {
      showShortToast(
        context,
        AppLocalizations.of(context).couldNotLoadSelectedPhoto,
      );
      return;
    }
    final croppedBytes = await routeToPage(
      context,
      ContactPhotoAdjustPage(imageBytes: sourceBytes),
    );
    if (croppedBytes is! Uint8List) {
      return;
    }
    _photoLoadGeneration++;
    setState(() {
      _isLoadingPhoto = true;
    });
    final photoBytes = await normalizeContactPhotoAttachmentBytes(croppedBytes);
    if (!mounted) {
      return;
    }
    setState(() {
      _draftPhotoBytes = photoBytes;
      _isLoadingPhoto = false;
      _photoDirty = true;
    });
  }

  Future<void> _saveContact() async {
    setState(() {
      _isSaving = true;
    });
    try {
      var saved = await PhotosContactsService.instance.createOrUpdateContact(
        contactUserId: widget.contactUserId,
        name: _nameController.text.trim(),
        birthDate: _birthDateToPreserve,
      );
      if (_photoDirty && _draftPhotoBytes != null) {
        saved = await PhotosContactsService.instance.setProfilePicture(
          contactId: saved.id,
          bytes: _draftPhotoBytes!,
        );
      }
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(saved);
    } catch (e, s) {
      _logger.severe("Failed to save contact", e, s);
      if (!mounted) {
        return;
      }
      await showGenericErrorDialog(context: context, error: e);
      setState(() {
        _isSaving = false;
      });
    }
  }

  Future<ButtonAction?> _showExitConfirmationDialog(
    BuildContext context,
  ) async {
    final l10n = AppLocalizations.of(context);
    if (_canSave) {
      final actionResult = await showActionSheet(
        context: context,
        body: l10n.saveChangesBeforeLeavingQuestion,
        buttons: [
          ButtonWidget(
            buttonType: ButtonType.neutral,
            labelText: l10n.save,
            isInAlert: true,
            buttonAction: ButtonAction.first,
            shouldStickToDarkTheme: true,
          ),
          ButtonWidget(
            buttonType: ButtonType.secondary,
            labelText: l10n.dontSave,
            isInAlert: true,
            buttonAction: ButtonAction.second,
            shouldStickToDarkTheme: true,
          ),
          ButtonWidget(
            buttonType: ButtonType.secondary,
            labelText: l10n.cancel,
            isInAlert: true,
            buttonAction: ButtonAction.cancel,
            shouldStickToDarkTheme: true,
          ),
        ],
      );
      return actionResult?.action;
    }

    final actionResult = await showActionSheet(
      context: context,
      body: l10n.doYouWantToDiscardTheEditsYouHaveMade,
      buttons: [
        ButtonWidget(
          labelText: l10n.yesDiscardChanges,
          buttonType: ButtonType.critical,
          shouldStickToDarkTheme: true,
          buttonAction: ButtonAction.first,
          isInAlert: true,
        ),
        ButtonWidget(
          labelText: l10n.cancel,
          buttonType: ButtonType.secondary,
          shouldStickToDarkTheme: true,
          buttonAction: ButtonAction.cancel,
          isInAlert: true,
        ),
      ],
      actionSheetType: ActionSheetType.defaultActionSheet,
    );
    return actionResult?.action;
  }

  Future<Uint8List?> _loadEditablePhotoBytesFromFile(EnteFile file) async {
    return getThumbnail(file);
  }
}

class _EditContactHeader extends StatelessWidget {
  const _EditContactHeader({required this.title, required this.onBack});

  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.paddingOf(context).top;
    final colors = context.componentColors;
    final height = topPadding + 76;

    return SizedBox(
      width: double.infinity,
      height: height,
      child: Padding(
        padding: EdgeInsets.only(top: topPadding),
        child: ColoredBox(
          color: colors.backgroundBase,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
            child: _expandedContent(context),
          ),
        ),
      ),
    );
  }

  Widget _expandedContent(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _BackButton(onBack: onBack),
          const SizedBox(height: 8),
          Text(title, style: _titleStyle(context)),
        ],
      ),
    );
  }

  TextStyle _titleStyle(BuildContext context) {
    return TextStyles.display2.copyWith(
      color: context.componentColors.textBase,
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final tooltip = MaterialLocalizations.of(context).backButtonTooltip;
    return Semantics(
      button: true,
      label: tooltip,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onBack,
        child: SizedBox(
          width: 40,
          height: 20,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Icon(
              Icons.arrow_back,
              size: 24,
              color: getEnteColorScheme(context).textBase,
            ),
          ),
        ),
      ),
    );
  }
}

class _ReadOnlyContactTextInput extends StatelessWidget {
  const _ReadOnlyContactTextInput({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyles.body.copyWith(color: colors.textBase)),
        const SizedBox(height: 9),
        Container(
          height: 52,
          width: double.infinity,
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: Spacing.lg),
          decoration: BoxDecoration(
            color: colors.fillLight,
            borderRadius: BorderRadius.circular(Radii.lg),
          ),
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyles.body.copyWith(color: colors.textLightest),
          ),
        ),
      ],
    );
  }
}

class _ContactSaveButton extends StatelessWidget {
  const _ContactSaveButton({
    required this.label,
    required this.isDisabled,
    required this.onTap,
  });

  final String label;
  final bool isDisabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final enabled = !isDisabled && onTap != null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: AnimatedContainer(
        duration: Motion.standard,
        curve: Curves.easeInOutCubic,
        width: double.infinity,
        height: 48,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: Spacing.xxl),
        decoration: BoxDecoration(
          color: enabled ? colors.primary : colors.fillDark,
          borderRadius: BorderRadius.circular(Radii.button),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyles.body.copyWith(
            color: enabled ? colors.specialWhite : colors.textLightest,
          ),
        ),
      ),
    );
  }
}

class _AvatarEditButton extends StatelessWidget {
  final double size;
  final VoidCallback onTap;

  const _AvatarEditButton({required this.size, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: getEnteColorScheme(context).greenBase,
          shape: BoxShape.circle,
        ),
        child: const Center(
          child: Icon(Icons.edit_outlined, color: Colors.white, size: 12),
        ),
      ),
    );
  }
}

class _ContactThumbnailShell extends StatelessWidget {
  const _ContactThumbnailShell({
    required this.size,
    required this.child,
    this.backgroundColor,
  });

  final double size;
  final Widget child;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: FaceThumbnailSquircleClip(
        borderRadius: faceThumbnailSquircleBorderRadius(size),
        child: ColoredBox(
          color: backgroundColor ?? Colors.transparent,
          child: SizedBox.expand(child: child),
        ),
      ),
    );
  }
}
