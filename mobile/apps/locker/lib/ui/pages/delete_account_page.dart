import "dart:convert";

import "package:ente_accounts/ente_accounts.dart";
import "package:ente_components/ente_components.dart";
import "package:ente_configuration/base_configuration.dart";
import "package:ente_crypto_api/ente_crypto_api.dart";
import "package:ente_lock_screen/local_authentication_service.dart";
import "package:ente_strings/ente_strings.dart";
import "package:ente_ui/utils/toast_util.dart";
import "package:ente_utils/email_util.dart";
import "package:flutter/material.dart";
import "package:locker/l10n/l10n.dart";
import "package:locker/utils/bottom_sheet_illustration.dart";

class DeleteAccountPage extends StatelessWidget {
  final BaseConfiguration config;

  const DeleteAccountPage(this.config, {super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final l10n = context.l10n;

    return Scaffold(
      backgroundColor: colors.backgroundBase,
      appBar: AppBar(
        backgroundColor: colors.backgroundBase,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 48,
        leadingWidth: 48,
        leading: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: const Icon(Icons.arrow_back),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.deleteAccount, style: TextStyles.h2),
              const SizedBox(height: 24),
              Center(
                child: Image.asset(
                  "assets/file_delete_icon.png",
                  width: 115,
                  height: 104,
                ),
              ),
              const SizedBox(height: 24),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: l10n
                          .deleteAccountFeedbackPrompt("feedback@ente.com")
                          .split("feedback@ente.com")[0],
                    ),
                    TextSpan(
                      text: "feedback@ente.com",
                      style: TextStyle(color: colors.primary),
                    ),
                    TextSpan(
                      text: l10n
                          .deleteAccountFeedbackPrompt("feedback@ente.com")
                          .split("feedback@ente.com")[1],
                    ),
                  ],
                  style: TextStyles.body.copyWith(color: colors.textLight),
                ),
              ),
              const SizedBox(height: 16),
              ButtonComponent(
                label: l10n.sendFeedback,
                onTap: () async {
                  await sendEmail(
                    context,
                    to: "feedback@ente.com",
                    subject: "[Feedback]",
                  );
                },
              ),
              const SizedBox(height: 24),
              Text(
                l10n.deleteAccountPermanentWarning,
                style: TextStyles.body.copyWith(color: colors.textLight),
              ),
              const SizedBox(height: 16),
              ButtonComponent(
                label: l10n.deleteAccount,
                variant: ButtonComponentVariant.critical,
                onTap: () async => {await _initiateDelete(context)},
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _initiateDelete(BuildContext context) async {
    final deleteChallengeResponse = await UserService.instance
        .getDeleteChallenge(context);
    if (deleteChallengeResponse == null) {
      return;
    }
    await _confirmAndDelete(context, deleteChallengeResponse);
  }

  Future<void> _confirmAndDelete(
    BuildContext context,
    DeleteChallengeResponse response,
  ) async {
    final hasAuthenticated = await LocalAuthenticationService.instance
        .requestLocalAuthentication(
          context,
          context.strings.initiateAccountDeleteTitle,
        );

    if (hasAuthenticated) {
      final confirmed = await _showDeleteConfirmationSheet(context);
      if (confirmed != true) {
        return;
      }
      final decryptChallenge = CryptoUtil.openSealSync(
        CryptoUtil.base642bin(response.encryptedChallenge),
        CryptoUtil.base642bin(config.getKeyAttributes()!.publicKey),
        config.getSecretKey()!,
      );
      final challengeResponseStr = utf8.decode(decryptChallenge);
      await UserService.instance.deleteAccount(context, challengeResponseStr);
      if (!context.mounted) {
        return;
      }
      showShortToast(context, context.strings.yourAccountHasBeenDeleted);
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  Future<bool?> _showDeleteConfirmationSheet(BuildContext context) async {
    return showBottomSheetComponent<bool>(
      context: context,
      builder: (_) => BottomSheetComponent(
        title: context.strings.confirmAccountDeleteTitle,
        message: context.strings.confirmAccountDeleteMessage,
        illustration: LockerBottomSheetIllustration.warningGrey,
        actions: [
          ButtonComponent(
            label: context.strings.delete,
            variant: ButtonComponentVariant.critical,
            onTap: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );
  }
}
