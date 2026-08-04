import 'package:ente_auth/ui/settings/language_picker.dart';
import 'package:ente_components/ente_components.dart';
import 'package:ente_strings/ente_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'language picker normalizes a device locale to its supported row',
    (tester) async {
      await _pumpPage(
        tester,
        LanguageSelectorPage(
          const [Locale('en'), Locale('fr')],
          (_) {},
          const Locale('en', 'US'),
        ),
      );

      final englishRow = find.widgetWithText(MenuComponent, 'English (en)');
      final radio = tester.widget<RadioComponent>(
        find.descendant(of: englishRow, matching: find.byType(RadioComponent)),
      );

      expect(radio.selected, isTrue);
      expect(find.byType(MenuGroupComponent), findsOneWidget);
    },
  );
}

Future<void> _pumpPage(WidgetTester tester, Widget page) {
  return tester.pumpWidget(
    MaterialApp(
      theme: ComponentTheme.lightTheme(app: ComponentApp.auth),
      localizationsDelegates: StringsLocalizations.localizationsDelegates,
      supportedLocales: StringsLocalizations.supportedLocales,
      home: page,
    ),
  );
}
