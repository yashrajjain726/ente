import 'package:ente_auth/ui/settings/components/auth_settings_page_scaffold.dart';
import 'package:ente_components/ente_components.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('settings scaffold uses the component surface and renders body', (
    tester,
  ) async {
    await _pump(
      tester,
      const AuthSettingsPageScaffold(
        title: 'Data',
        children: [Text('Import codes')],
      ),
    );

    expect(find.text('Data'), findsOneWidget);
    expect(find.text('Import codes'), findsOneWidget);
    expect(find.byType(AppBarComponent), findsOneWidget);
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.backgroundColor, ColorTokens.light.backgroundBase);
  });
}

Future<void> _pump(WidgetTester tester, Widget child) {
  return tester.pumpWidget(
    MaterialApp(
      theme: ComponentTheme.lightTheme(app: ComponentApp.auth),
      home: child,
    ),
  );
}
