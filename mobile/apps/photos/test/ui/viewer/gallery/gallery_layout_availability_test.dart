import "package:dio/dio.dart";
import "package:ente_strings/ente_strings.dart";
import "package:ente_ui/models/settings_search_item.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:package_info_plus/package_info_plus.dart";
import "package:photos/core/configuration.dart";
import "package:photos/ente_theme_data.dart";
import "package:photos/models/gallery/gallery_layout_config.dart";
import "package:photos/service_locator.dart";
import "package:photos/settings/local_settings.dart";
import "package:photos/ui/settings/gallery_settings_screen.dart";
import "package:photos/ui/settings/search/settings_search_registry.dart";
import "package:photos/ui/viewer/gallery/layout_settings.dart";
import "package:shared_preferences/shared_preferences.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    ServiceLocator.instance.init(
      preferences,
      Dio(),
      Dio(),
      Dio(),
      PackageInfo(
        appName: "Photos",
        packageName: "photos",
        version: "1.0.0",
        buildNumber: "1",
      ),
    );
    try {
      await Configuration.instance.init(preferences);
    } catch (_) {}

    // Construct the delayed flag refresher outside the widget-test fake clock.
    expect(flagService.internalUser, isTrue);
  });

  setUp(() async {
    await localSettings.setInternalUserDisabled(false);
    await localSettings.setGalleryLayoutType(GalleryLayoutType.mosaic);
  });

  tearDown(() async {
    await localSettings.setInternalUserDisabled(false);
    await localSettings.setGalleryLayoutType(GalleryLayoutType.grid);
  });

  testWidgets("public users cannot discover mosaic layout controls", (
    tester,
  ) async {
    await localSettings.setInternalUserDisabled(true);
    expect(isMosaicLayoutAvailable, isFalse);

    await tester.pumpWidget(
      _testApp(const GallerySettingsScreen(fromGalleryLayoutSettingsCTA: true)),
    );
    await tester.pumpAndSettle();
    var context = tester.element(find.byType(GallerySettingsScreen));
    var l10n = context.strings;
    expect(find.text(l10n.layout), findsNothing);
    expect(find.text(l10n.layoutMasonry), findsNothing);

    await tester.pumpWidget(_testApp(const GalleryLayoutSettings()));
    await tester.pumpAndSettle();
    context = tester.element(find.byType(GalleryLayoutSettings));
    l10n = context.strings;
    expect(find.text(l10n.layoutMasonry), findsNothing);

    final searchItems = SettingsSearchRegistry.getSearchableItems(context);
    expect(
      searchItems.every(
        (item) =>
            item.matchType("mosaic") == SettingsSearchMatchType.none &&
            item.matchType("masonry") == SettingsSearchMatchType.none,
      ),
      isTrue,
    );
    expect(searchItems.where((item) => item.title == l10n.layout), isEmpty);
    expect(localSettings.getGalleryLayoutType(), GalleryLayoutType.mosaic);
  });

  testWidgets("internal and debug users can discover mosaic layout controls", (
    tester,
  ) async {
    expect(isMosaicLayoutAvailable, isTrue);

    await tester.pumpWidget(_testApp(const GalleryLayoutSettings()));
    await tester.pumpAndSettle();
    var context = tester.element(find.byType(GalleryLayoutSettings));
    var l10n = context.strings;
    expect(find.text(l10n.layoutMasonry), findsOneWidget);

    await localSettings.setGalleryLayoutType(GalleryLayoutType.grid);
    await tester.pumpWidget(
      _testApp(const GallerySettingsScreen(fromGalleryLayoutSettingsCTA: true)),
    );
    await tester.pumpAndSettle();
    context = tester.element(find.byType(GallerySettingsScreen));
    l10n = context.strings;
    expect(find.text(l10n.layout), findsOneWidget);
    await tester.tap(find.text(l10n.layout));
    await tester.pumpAndSettle();
    expect(find.text(l10n.layoutMasonry), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey(GalleryLayoutType.mosaic)));
    await tester.pumpAndSettle();
    expect(localSettings.getGalleryLayoutType(), GalleryLayoutType.mosaic);

    final searchItems = SettingsSearchRegistry.getSearchableItems(context);
    expect(
      searchItems.any(
        (item) =>
            item.matchType("mosaic") != SettingsSearchMatchType.none &&
            item.matchType("masonry") != SettingsSearchMatchType.none,
      ),
      isTrue,
    );
    expect(searchItems.where((item) => item.title == l10n.layout), isNotEmpty);
  });
}

Widget _testApp(Widget child) {
  return MaterialApp(
    theme: lightThemeData,
    localizationsDelegates: StringsLocalizations.localizationsDelegates,
    supportedLocales: StringsLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
}
