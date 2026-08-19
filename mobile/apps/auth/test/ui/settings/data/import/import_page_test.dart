import 'package:ente_auth/ui/settings/data/import_page.dart';
import 'package:ente_components/ente_components.dart';
import 'package:ente_strings/ente_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('plain text source opens an Ente instruction sheet', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ComponentTheme.lightTheme(app: ComponentApp.auth),
        localizationsDelegates: StringsLocalizations.localizationsDelegates,
        supportedLocales: StringsLocalizations.supportedLocales,
        home: const ImportCodePage(),
      ),
    );

    await tester.tap(find.text('Plain text'));
    await tester.pumpAndSettle();

    expect(find.text('Select file'), findsOneWidget);
    expect(find.byTooltip('Cancel'), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Semantics &&
            widget.properties.identifier ==
                'auth_import_instruction_plain_text',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Select file'), findsNothing);
  });
}
