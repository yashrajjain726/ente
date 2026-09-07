import "dart:async";

import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:photos/utils/dialog_util.dart";

Future<bool> showSharingProgressSheet(
  BuildContext context, {
  required Future<bool> Function() task,
}) async {
  Object? taskError;
  final result = await showBottomSheetComponent<bool>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    builder: (sheetContext) => _SharingProgressSheet(
      task: () async {
        try {
          return await task();
        } catch (error) {
          taskError = error;
          return false;
        }
      },
    ),
  );
  if (taskError != null && context.mounted) {
    await showGenericErrorDialog(context: context, error: taskError);
  }
  return result ?? false;
}

class _SharingProgressSheet extends StatefulWidget {
  const _SharingProgressSheet({required this.task});

  final Future<bool> Function() task;

  @override
  State<_SharingProgressSheet> createState() => _SharingProgressSheetState();
}

class _SharingProgressSheetState extends State<_SharingProgressSheet> {
  bool _succeeded = false;

  @override
  void initState() {
    super.initState();
    unawaited(_runTask());
  }

  Future<void> _runTask() async {
    final succeeded = await widget.task();
    if (!mounted) {
      return;
    }
    if (!succeeded) {
      Navigator.of(context).pop(false);
      return;
    }
    setState(() => _succeeded = true);
    await Future<void>.delayed(const Duration(seconds: 1));
    if (mounted) {
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BottomSheetComponent(
      title: _succeeded ? context.strings.success : context.strings.sharing,
      showCloseButton: false,
      illustration: _succeeded
          ? Icon(
              Icons.check_circle,
              color: context.componentColors.primary,
              size: IconSizes.large,
            )
          : SizedBox.square(
              dimension: IconSizes.medium,
              child: CircularProgressIndicator(
                color: context.componentColors.primary,
                strokeWidth: 2,
              ),
            ),
    );
  }
}
