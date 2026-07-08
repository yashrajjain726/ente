import "package:ente_components/ente_components.dart";
import 'package:flutter/material.dart';
import "package:photos/core/event_bus.dart";
import "package:photos/events/file_caption_updated_event.dart";
import "package:photos/generated/l10n.dart";
import 'package:photos/models/file/file.dart';
import 'package:photos/ui/components/keyboard/keyboard_oveylay.dart';
import 'package:photos/ui/components/keyboard/keyboard_top_button.dart';
import "package:photos/ui/notification/toast.dart";
import 'package:photos/utils/magic_util.dart';

class FileCaptionReadyOnly extends StatelessWidget {
  final String caption;

  const FileCaptionReadyOnly({super.key, required this.caption});

  @override
  Widget build(BuildContext context) {
    return Text(
      caption,
      style: TextStyles.body.copyWith(color: context.componentColors.textLight),
    );
  }
}

class FileCaptionWidget extends StatefulWidget {
  final EnteFile file;

  const FileCaptionWidget({required this.file, super.key});

  @override
  State<FileCaptionWidget> createState() => _FileCaptionWidgetState();
}

class _FileCaptionWidgetState extends State<FileCaptionWidget> {
  static const int maxLength = 5000;

  final _textController = TextEditingController();
  final _focusNode = FocusNode();
  String? editedCaption;
  late String defaultHintText = AppLocalizations.of(
    context,
  ).fileInfoAddDescHint;
  Widget? keyboardTopButtons;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_focusNodeListener);
    editedCaption = widget.file.caption;
    if (editedCaption != null && editedCaption!.isNotEmpty) {
      _textController.text = editedCaption!;
    }
  }

  @override
  void dispose() {
    if (editedCaption != null) {
      editFileCaption(
        null,
        widget.file,
        editedCaption!,
      ).then((isSuccess) => _onEditFileFinish(isSuccess));
    }
    _textController.dispose();
    _focusNode.removeListener(_focusNodeListener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextInputComponent(
      controller: _textController,
      focusNode: _focusNode,
      hintText: defaultHintText,
      maxLength: maxLength,
      minLines: 1,
      maxLines: 10,
      textCapitalization: TextCapitalization.sentences,
      keyboardType: TextInputType.multiline,
      onSubmit: (value) => _onDoneClick(context),
      onChanged: (value) {
        editedCaption = value;
      },
    );
  }

  Future<void> _onDoneClick(BuildContext context) async {
    if (editedCaption != null) {
      final isSuccesful = await editFileCaption(
        context,
        widget.file,
        editedCaption!,
      ).then((isSuccess) => _onEditFileFinish(isSuccess));
      if (isSuccesful) {
        if (mounted) {
          Navigator.pop(context);
        }
      }
    }
  }

  void onCancelTap() {
    _textController.text = widget.file.caption ?? '';
    _focusNode.unfocus();
    editedCaption = null;
  }

  void onDoneTap() {
    _focusNode.unfocus();
    _onDoneClick(context);
  }

  void _focusNodeListener() {
    keyboardTopButtons ??= KeyboardTopButton(
      onDoneTap: onDoneTap,
      onCancelTap: onCancelTap,
    );
    if (_focusNode.hasFocus) {
      KeyboardOverlay.showOverlay(context, keyboardTopButtons!);
    } else {
      KeyboardOverlay.removeOverlay();
    }
  }

  bool _onEditFileFinish(bool isSuccess) {
    if (!mounted) {
      return isSuccess;
    }
    if (isSuccess) {
      widget.file.pubMagicMetadata?.caption = editedCaption;
      final generatedID = widget.file.generatedID;
      if (generatedID != null) {
        Bus.instance.fire(FileCaptionUpdatedEvent(generatedID));
      }
      return true;
    } else {
      showShortToast(context, AppLocalizations.of(context).somethingWentWrong);
      return false;
    }
  }
}
