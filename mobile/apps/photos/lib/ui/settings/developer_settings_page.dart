import 'package:flutter/material.dart';
import 'package:logging/logging.dart';
import "package:photos/app_mode.dart";
import "package:photos/core/configuration.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/core/network/network.dart";
import "package:photos/events/app_mode_changed_event.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/service_locator.dart";
import "package:photos/ui/common/gradient_button.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/utils/dialog_util.dart";
import "package:photos/utils/local_settings.dart";

Future<AppMode?> _maybeApplyDeveloperAppModeInput(
  String input, {
  required LocalSettings settings,
}) async {
  if (input == "offline") {
    await settings.setShowOfflineModeOption(true);
    await settings.setAppMode(AppMode.offline);
    return AppMode.offline;
  }

  if (input == "online") {
    await settings.setShowOfflineModeOption(false);
    await settings.setAppMode(AppMode.online);
    return AppMode.online;
  }

  return null;
}

class DeveloperSettingsPage extends StatefulWidget {
  const DeveloperSettingsPage({super.key});

  @override
  State<DeveloperSettingsPage> createState() => _DeveloperSettingsPageState();
}

class _DeveloperSettingsPageState extends State<DeveloperSettingsPage> {
  final _logger = Logger('DeveloperSettingsPage');
  final _urlController = TextEditingController();

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _logger.info(
      "Current endpoint is: ${Configuration.instance.getHttpEndpoint()}",
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).developerSettings),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context).serverEndpoint,
                hintText: Configuration.instance.getHttpEndpoint(),
              ),
              autofocus: true,
            ),
            const SizedBox(height: 40),
            GradientButton(
              onTap: () async {
                final url = _urlController.text.trim();
                _logger.info("Entered endpoint: $url");
                final appMode = await _maybeApplyDeveloperAppModeInput(
                  url,
                  settings: localSettings,
                );
                if (appMode != null) {
                  Bus.instance.fire(AppModeChangedEvent());
                  showToast(
                    context,
                    appMode == AppMode.offline
                        ? "App mode set to offline"
                        : "App mode set to online",
                  );
                  Navigator.of(context).pop();
                  return;
                }
                try {
                  final uri = Uri.parse(url);
                  if ((uri.scheme == "http" || uri.scheme == "https")) {
                    await _ping(url);
                    await Configuration.instance.setHttpEndpoint(url);
                    showToast(
                      context,
                      AppLocalizations.of(context).endpointUpdatedMessage,
                    );
                    Navigator.of(context).pop();
                  } else {
                    throw const FormatException();
                  }
                } catch (e) {
                  // ignore: unawaited_futures
                  showErrorDialog(
                    context,
                    AppLocalizations.of(context).invalidEndpoint,
                    AppLocalizations.of(context).invalidEndpointMessage +
                        "\n" +
                        e.toString(),
                  );
                }
              },
              text: AppLocalizations.of(context).save,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _ping(String endpoint) async {
    try {
      final response =
          await NetworkClient.instance.getDio().get('$endpoint/ping');
      if (response.data['message'] != 'pong') {
        throw Exception('Invalid response');
      }
    } catch (e) {
      throw Exception('Error occurred: $e');
    }
  }
}
