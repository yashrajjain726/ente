import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:ente_ui/components/settings/about_settings_section.dart";
import "package:ente_ui/utils/toast_util.dart";
import "package:flutter/material.dart";
import "package:locker/services/update_service.dart";
import "package:locker/ui/settings/widgets/app_update_dialog.dart";

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.strings;

    return SettingsPageScaffold(
      title: l10n.about,
      children: [
        AboutSettingsSection(
          onCheckForUpdates: UpdateService.instance.isIndependent()
              ? () => _onCheckForUpdatesTapped(context)
              : null,
        ),
      ],
    );
  }

  Future<void> _onCheckForUpdatesTapped(BuildContext context) async {
    final l10n = context.strings;
    final shouldUpdate = await UpdateService.instance.shouldUpdate();
    final latestVersion = UpdateService.instance.getLatestVersionInfo();
    if (!context.mounted) {
      return;
    }
    if (latestVersion == null) {
      showShortToast(context, l10n.unableToCheckForUpdatesRightNow);
      return;
    }
    if (!shouldUpdate) {
      showShortToast(context, l10n.youAreOnTheLatestVersion);
      return;
    }
    await showAppUpdateBottomSheet(context, latestVersionInfo: latestVersion);
  }
}
