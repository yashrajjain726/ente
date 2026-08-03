import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import 'package:flutter/material.dart';
import 'package:photos/core/configuration.dart';
import 'package:photos/ui/account/password_entry_page.dart';
import "package:photos/ui/components/alert_bottom_sheet.dart";
import 'package:photos/ui/notification/toast.dart';
import 'package:photos/utils/dialog_util.dart';

class RecoveryPage extends StatefulWidget {
  const RecoveryPage({super.key});

  @override
  State<RecoveryPage> createState() => _RecoveryPageState();
}

class _RecoveryPageState extends State<RecoveryPage> {
  final _recoveryKeyController = TextEditingController();

  @override
  void dispose() {
    _recoveryKeyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final isFormValid = _recoveryKeyController.text.isNotEmpty;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: colors.backgroundBase,
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: colors.backgroundBase,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          color: colors.iconColor,
          onPressed: () {
            Navigator.of(context).pop();
          },
        ),
        title: Text(
          StringsLocalizations.of(context).recoverAccount,
          style: TextStyles.large.copyWith(color: colors.textBase),
        ),
        centerTitle: true,
      ),
      body: _getBody(),
      floatingActionButton: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: ButtonComponent(
          key: const ValueKey("recoveryButton"),
          label: StringsLocalizations.of(context).logInLabel,
          isDisabled: !isFormValid,
          onTap: isFormValid ? _onRecoverPressed : null,
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }

  Widget _getBody() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 12),
          TextInputComponent(
            label: StringsLocalizations.of(context).recoveryKey,
            hintText: StringsLocalizations.of(context).enterYourRecoveryKey,
            controller: _recoveryKeyController,
            keyboardType: TextInputType.multiline,
            maxLines: null,
            minLines: 5,
            autocorrect: false,
            onChanged: (value) {
              setState(() {});
            },
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ButtonComponent(
              label: StringsLocalizations.of(context).forgotRecoveryKey,
              variant: ButtonComponentVariant.link,
              size: ButtonComponentSize.small,
              shouldSurfaceExecutionStates: false,
              onTap: () async {
                // ignore: unawaited_futures
                showAlertBottomSheet(
                  context,
                  title: StringsLocalizations.of(context).sorry,
                  message: StringsLocalizations.of(
                    context,
                  ).noRecoveryKeyNoDecryption,
                  assetPath: 'assets/warning-grey.png',
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onRecoverPressed() async {
    FocusScope.of(context).unfocus();
    final dialog = createProgressDialog(
      context,
      StringsLocalizations.of(context).decrypting,
    );
    await dialog.show();
    try {
      await Configuration.instance.recover(_recoveryKeyController.text.trim());
      await dialog.hide();
      if (!mounted) return;
      showShortToast(
        context,
        StringsLocalizations.of(context).recoverySuccessful,
      );
      if (!mounted) return;
      // ignore: unawaited_futures
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (BuildContext context) {
            return const PopScope(
              canPop: false,
              child: PasswordEntryPage(mode: PasswordEntryMode.reset),
            );
          },
        ),
      );
    } catch (e) {
      await dialog.hide();
      if (!mounted) return;
      String errMessage = StringsLocalizations.of(
        context,
      ).incorrectRecoveryKeyBody;
      if (e is AssertionError) {
        errMessage = '$errMessage : ${e.message}';
      }
      if (!mounted) return;
      // ignore: unawaited_futures
      showAlertBottomSheet(
        context,
        title: StringsLocalizations.of(context).incorrectRecoveryKeyTitle,
        message: errMessage,
        assetPath: 'assets/warning-grey.png',
      );
    }
  }
}
