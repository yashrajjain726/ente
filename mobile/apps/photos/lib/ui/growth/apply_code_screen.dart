import "package:ente_components/ente_components.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/material.dart";
import "package:logging/logging.dart";
import "package:photos/gateways/storage_bonus/models/storage_bonus.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/user_details.dart";
import "package:photos/service_locator.dart";
import "package:photos/ui/growth/code_success_screen.dart";
import "package:photos/ui/settings/components/settings_page_scaffold.dart";
import "package:photos/utils/dialog_util.dart";

class ApplyCodeScreen extends StatefulWidget {
  // referrerView and userDetails used to render code_success_screen
  final ReferralView referralView;
  final UserDetails userDetails;
  const ApplyCodeScreen(this.referralView, this.userDetails, {super.key});

  @override
  State<ApplyCodeScreen> createState() => _ApplyCodeScreenState();
}

class _ApplyCodeScreenState extends State<ApplyCodeScreen> {
  late TextEditingController _textController;

  late FocusNode textFieldFocusNode;
  String code = "";
  bool _isApplying = false;

  @override
  void initState() {
    _textController = TextEditingController();
    textFieldFocusNode = FocusNode();
    super.initState();
  }

  @override
  void dispose() {
    _textController.dispose();
    textFieldFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SettingsPageScaffold(
      title: l10n.applyCodeTitle,
      children: [
        Text(
          l10n.enterCodeDescription,
          style: TextStyles.body.copyWith(
            color: context.componentColors.textLight,
          ),
        ),
        const SizedBox(height: Spacing.xxl),
        TextInputComponent(
          controller: _textController,
          focusNode: textFieldFocusNode,
          autofocus: true,
          inputFormatters: [UpperCaseTextFormatter()],
          textCapitalization: TextCapitalization.characters,
          hintText: l10n.enterReferralCode,
          autocorrect: false,
          keyboardType: TextInputType.text,
          textInputAction: TextInputAction.done,
          onChanged: (value) {
            setState(() => code = value.trim());
          },
          onSubmit: (_) => _applyCode(),
        ),
        const SizedBox(height: Spacing.xl),
        ButtonComponent(
          label: l10n.apply,
          isDisabled: _isApplying || code.trim().length < 4,
          shouldShowSuccessState: false,
          onTap: _applyCode,
        ),
      ],
    );
  }

  Future<void> _applyCode() async {
    if (_isApplying || code.trim().length < 4) return;
    setState(() => _isApplying = true);
    try {
      await storageBonusService.applyCode(code);
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) =>
              CodeSuccessScreen(widget.referralView, widget.userDetails),
        ),
      );
    } catch (e) {
      Logger('$runtimeType').severe("failed to apply referral", e);
      if (!mounted) return;
      await showErrorDialogForException(
        context: context,
        exception: e as Exception,
        apiErrorPrefix: AppLocalizations.of(context).failedToApplyCode,
      );
    } finally {
      if (mounted) setState(() => _isApplying = false);
    }
  }
}
