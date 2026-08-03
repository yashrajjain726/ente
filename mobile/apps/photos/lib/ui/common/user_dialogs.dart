import "dart:async";

import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:photos/ui/components/buttons/button_widget.dart";
import "package:photos/ui/components/dialog_widget.dart";
import "package:photos/ui/components/models/button_type.dart";
import "package:photos/utils/share_util.dart";

Future<void> showInviteDialog(BuildContext context, String email) async {
  await showDialogWidget(
    context: context,
    title: StringsLocalizations.of(context).inviteToEnte,
    icon: Icons.info_outline,
    body: StringsLocalizations.of(
      context,
    ).emailNoEnteAccountPhotos(email: email),
    isDismissible: true,
    buttons: [
      ButtonWidget(
        buttonType: ButtonType.neutral,
        icon: Icons.adaptive.share,
        labelText: StringsLocalizations.of(context).sendInvite,
        isInAlert: true,
        onTap: () async {
          unawaited(
            shareText(
              StringsLocalizations.of(
                context,
              ).shareTextRecommendUsingEnteForPhotos,
            ),
          );
        },
      ),
    ],
  );
}
