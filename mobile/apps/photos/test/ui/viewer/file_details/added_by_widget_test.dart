import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/metadata/file_magic.dart";
import "package:photos/ui/viewer/file_details/added_by_widget.dart";

void main() {
  testWidgets("public uploader avatar stays black", (tester) async {
    final file = EnteFile()
      ..uploadedFileID = 1
      ..pubMagicMetadata = PubMagicMetadata(uploaderName: "Guest");

    await tester.pumpWidget(
      MaterialApp(
        theme: ComponentTheme.lightTheme(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: AddedByWidget(file)),
      ),
    );

    final avatar = tester.widget<DecoratedBox>(
      find
          .ancestor(of: find.text("G"), matching: find.byType(DecoratedBox))
          .first,
    );
    expect((avatar.decoration as BoxDecoration).color, Colors.black);
  });
}
