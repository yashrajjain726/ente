import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/ui/common/progress_dialog.dart";

void main() {
  testWidgets("ignores updates from a dialog instance that was not shown", (
    tester,
  ) async {
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (ctx) {
            context = ctx;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    final firstDialog = ProgressDialog(context);
    firstDialog.style(
      message: "Downloading (0/2)",
      progressWidget: const SizedBox.shrink(),
    );

    final firstShow = firstDialog.show();
    await tester.pump();

    final secondDialog = ProgressDialog(context);
    final secondShown = await secondDialog.show();

    expect(secondShown, isFalse);
    expect(
      () => secondDialog.update(message: "Downloading (1/2)"),
      returnsNormally,
    );

    await tester.pump(const Duration(milliseconds: 200));
    expect(await firstShow, isTrue);

    final hideFuture = firstDialog.hide();
    await tester.pumpAndSettle();
    expect(await hideFuture, isTrue);
  });

  testWidgets("waits for sequential dismissals before the page is popped", (
    tester,
  ) async {
    bool? routeResult;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                routeResult = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const _DeletionPage()),
                );
              },
              child: const Text("Open"),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text("Open"));
    await tester.pumpAndSettle();
    await tester.tap(find.text("Delete"));
    for (var index = 0; index < 12; index++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pumpAndSettle();

    expect(find.text("Delete"), findsNothing);
    expect(routeResult, isTrue);
  });
}

class _DeletionPage extends StatelessWidget {
  const _DeletionPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: TextButton(
        onPressed: () async {
          for (final message in ["Deleting", "Loading", "Deleting again"]) {
            final dialog = ProgressDialog(context, isDismissible: false);
            dialog.style(
              message: message,
              progressWidget: const SizedBox.shrink(),
            );
            await dialog.show();
            await dialog.hide();
          }
          if (context.mounted) {
            Navigator.of(context).pop(true);
          }
        },
        child: const Text("Delete"),
      ),
    );
  }
}
