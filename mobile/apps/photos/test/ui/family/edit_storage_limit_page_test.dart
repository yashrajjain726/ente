import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photos/ente_theme_data.dart';
import 'package:photos/generated/l10n.dart';
import 'package:photos/models/user_details.dart';
import 'package:photos/ui/family/edit_storage_limit_page.dart';

void main() {
  testWidgets('shows the family listing display name', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: lightThemeData,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: EditStorageLimitPage(
          member: FamilyMember(
            'member@example.com',
            1024 * 1024 * 1024,
            'family-member',
            42,
            false,
            FamilyMemberStatus.accepted,
            null,
          ),
          displayName: 'Linked person',
          totalStorageInBytes: 10 * 1024 * 1024 * 1024,
          avatarColor: Colors.green,
        ),
      ),
    );

    expect(find.text('Linked person'), findsOneWidget);
    expect(find.text('member@example.com'), findsNothing);
    expect(find.text('L'), findsOneWidget);
  });
}
