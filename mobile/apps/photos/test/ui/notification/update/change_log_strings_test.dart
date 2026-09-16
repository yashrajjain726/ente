import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:photos/locale.dart';
import 'package:photos/ui/notification/update/change_log_strings.dart';

void main() {
  test('resolves exact, language-only, and English fallback locales', () {
    final portuguese = ChangeLogStrings.maybeForLocale(
      const Locale('pt', 'BR'),
      isAndroid: true,
    );
    final german = ChangeLogStrings.maybeForLocale(
      const Locale('de'),
      isAndroid: true,
    );
    final regionalGerman = ChangeLogStrings.maybeForLocale(
      const Locale('de', 'DE'),
      isAndroid: true,
    );
    final fallback = ChangeLogStrings.maybeForLocale(
      const Locale('xx'),
      isAndroid: true,
    );

    expect(portuguese, isNotNull);
    expect(german, isNotNull);
    expect(
      regionalGerman!.entries.map((entry) => entry.title),
      german!.entries.map((entry) => entry.title),
    );
    expect(fallback!.entries.first.title, 'Preview strip in the viewer');
  });

  test('filters the English sheet by platform and app mode', () {
    final signedInAndroid = ChangeLogStrings.maybeForLocale(
      const Locale('en'),
      isAndroid: true,
    )!;
    final signedInIOS = ChangeLogStrings.maybeForLocale(
      const Locale('en'),
      isAndroid: false,
    )!;
    final localGalleryAndroid = ChangeLogStrings.maybeForLocale(
      const Locale('en'),
      isLocalGallery: true,
      isAndroid: true,
    )!;
    final localGalleryIOS = ChangeLogStrings.maybeForLocale(
      const Locale('en'),
      isLocalGallery: true,
      isAndroid: false,
    )!;

    expect(signedInAndroid.entries.map((entry) => entry.title), [
      'Preview strip in the viewer',
      'Share photos of a person',
      'Set photos as wallpaper',
      'Hold for 2× playback',
      'And more!',
    ]);
    expect(signedInIOS.entries.map((entry) => entry.title), [
      'Preview strip in the viewer',
      'Share photos of a person',
      'Hold for 2× playback',
      'And more!',
    ]);
    expect(localGalleryAndroid.entries.map((entry) => entry.title), [
      'Preview strip in the viewer',
      'Set photos as wallpaper',
      'Hold for 2× playback',
      'And more!',
    ]);
    expect(localGalleryIOS.entries.map((entry) => entry.title), [
      'Preview strip in the viewer',
      'Hold for 2× playback',
      'And more!',
    ]);
    expect(signedInIOS.entries.last.description, contains('improved backups'));
    expect(
      localGalleryIOS.entries.last.description,
      isNot(contains('backups')),
    );
  });

  test('returns null when filtering removes every entry', () {
    const onlineOnly = ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Online feature',
          description: 'Only available to signed-in users.',
          isOnlineOnly: true,
        ),
      ],
    );

    expect(
      onlineOnly.forAudience(isLocalGallery: true, isAndroid: true),
      isNull,
    );
  });

  test('every supported locale preserves platform and audience structure', () {
    for (final locale in appSupportedLocales) {
      expect(
        ChangeLogStrings.maybeForLocale(locale, isAndroid: true)!.entries,
        hasLength(5),
        reason: '$locale signed-in Android',
      );
      expect(
        ChangeLogStrings.maybeForLocale(locale, isAndroid: false)!.entries,
        hasLength(4),
        reason: '$locale signed-in iOS',
      );
      expect(
        ChangeLogStrings.maybeForLocale(
          locale,
          isLocalGallery: true,
          isAndroid: true,
        )!.entries,
        hasLength(4),
        reason: '$locale Local Gallery Android',
      );
      expect(
        ChangeLogStrings.maybeForLocale(
          locale,
          isLocalGallery: true,
          isAndroid: false,
        )!.entries,
        hasLength(3),
        reason: '$locale Local Gallery iOS',
      );
    }
  });
}
