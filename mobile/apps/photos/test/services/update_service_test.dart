import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:photos/services/update_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('fresh installs consume the current sheet without showing it', () async {
    final service = await _serviceWithPreferences({});

    expect(
      await service.getChangeLogAction(
        locale: const Locale('en'),
        isLocalGallery: false,
        isSignedIn: true,
      ),
      ChangeLogAction.skip,
    );
    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getInt(UpdateService.changeLogVersionKey),
      UpdateService.currentChangeLogVersion,
    );
  });

  test('already consumed sheets are skipped', () async {
    final service = await _serviceWithPreferences({
      UpdateService.changeLogVersionKey: UpdateService.currentChangeLogVersion,
    });

    expect(
      await service.getChangeLogAction(
        locale: const Locale('en'),
        isLocalGallery: false,
        isSignedIn: true,
      ),
      ChangeLogAction.skip,
    );
  });

  test(
    'outdated signed-in and Local Gallery installs show the sheet',
    () async {
      for (final mode in [
        (isLocalGallery: false, isSignedIn: true),
        (isLocalGallery: true, isSignedIn: false),
      ]) {
        final service = await _serviceWithPreferences({
          UpdateService.changeLogVersionKey:
              UpdateService.currentChangeLogVersion - 1,
        });

        expect(
          await service.getChangeLogAction(
            locale: const Locale('en'),
            isLocalGallery: mode.isLocalGallery,
            isSignedIn: mode.isSignedIn,
          ),
          ChangeLogAction.show,
        );
      }
    },
  );

  test('outdated unauthenticated installs skip the sheet', () async {
    final service = await _serviceWithPreferences({
      UpdateService.changeLogVersionKey:
          UpdateService.currentChangeLogVersion - 1,
    });

    expect(
      await service.getChangeLogAction(
        locale: const Locale('en'),
        isLocalGallery: false,
        isSignedIn: false,
      ),
      ChangeLogAction.skip,
    );
  });

  test(
    'outdated installs consume a sheet with no applicable content',
    () async {
      final service = await _serviceWithPreferences({
        UpdateService.changeLogVersionKey:
            UpdateService.currentChangeLogVersion - 1,
      }, hasChangeLogContent: (_, _, _) => false);

      expect(
        await service.getChangeLogAction(
          locale: const Locale('en'),
          isLocalGallery: true,
          isSignedIn: false,
        ),
        ChangeLogAction.consumeWithoutShowing,
      );
    },
  );
}

Future<UpdateService> _serviceWithPreferences(
  Map<String, Object> values, {
  bool Function(Locale locale, bool isLocalGallery, bool isAndroid)?
  hasChangeLogContent,
}) async {
  SharedPreferences.setMockInitialValues(values);
  final prefs = await SharedPreferences.getInstance();
  return UpdateService(
    prefs,
    PackageInfo(
      appName: 'Ente Photos',
      packageName: 'io.ente.photos',
      version: '1.3.64',
      buildNumber: '2158',
    ),
    isAndroid: false,
    hasChangeLogContent: hasChangeLogContent,
  );
}
