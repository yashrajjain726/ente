import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:photos/l10n/l10n.dart';
import 'package:photos/ui/notification/update/change_log_strings.dart';

void main() {
  test('returns every changelog entry for signed-in Photos', () {
    final strings = ChangeLogStrings.maybeForLocale(const Locale('en'));

    expect(strings?.entries.map((entry) => entry.title), [
      'Comments and reactions in memories',
      'Share memories, your way',
      'Photo viewer, polished',
      'Text in photos, sharper',
      'Smarter caching',
      'and more!',
    ]);
  });

  test('omits online-only entries in Local Gallery', () {
    final strings = ChangeLogStrings.maybeForLocale(
      const Locale('en'),
      isLocalGallery: true,
    );

    expect(strings?.entries.map((entry) => entry.title), [
      'Photo viewer, polished',
      'Text in photos, sharper',
      'Smarter caching',
    ]);
  });

  test('falls back to English for an unsupported locale', () {
    final strings = ChangeLogStrings.maybeForLocale(const Locale('eo'));

    expect(strings?.entries.first.title, 'Comments and reactions in memories');
  });

  test('has translations for every app-supported locale', () {
    for (final locale in appSupportedLocales) {
      final title = ChangeLogStrings.maybeForLocale(
        locale,
      )?.entries.first.title;
      if (locale.languageCode == 'en') {
        expect(title, 'Comments and reactions in memories');
      } else {
        expect(
          title,
          isNot('Comments and reactions in memories'),
          reason: 'Missing changelog translation for $locale',
        );
      }
    }
  });
}
