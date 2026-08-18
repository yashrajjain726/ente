import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";

void main() {
  group("theme", () {
    testWidgets("selects color tokens from the ambient brightness", (
      tester,
    ) async {
      late ColorTokens lightColors;
      late ColorTokens darkColors;

      await tester.pumpWidget(
        Theme(
          data: ComponentTheme.lightTheme(),
          child: Builder(
            builder: (context) {
              lightColors = ComponentTheme.colorsOf(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      await tester.pumpWidget(
        Theme(
          data: ComponentTheme.darkTheme(),
          child: Builder(
            builder: (context) {
              darkColors = context.componentColors;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(lightColors.backgroundBase, ColorTokens.light.backgroundBase);
      expect(lightColors.textBase, ColorTokens.light.textBase);
      expect(darkColors.backgroundBase, ColorTokens.dark.backgroundBase);
      expect(darkColors.textBase, ColorTokens.dark.textBase);
    });

    testWidgets("reads app-aware tokens from ComponentTheme ThemeData", (
      tester,
    ) async {
      late ColorTokens authColors;
      late ColorTokens lockerColors;

      await tester.pumpWidget(
        Theme(
          data: ComponentTheme.lightTheme(app: ComponentApp.auth),
          child: Builder(
            builder: (context) {
              authColors = context.componentColors;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      await tester.pumpWidget(
        Theme(
          data: ComponentTheme.darkTheme(app: ComponentApp.locker),
          child: Builder(
            builder: (context) {
              lockerColors = context.componentColors;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(authColors.primary, purpleDefaultLight);
      expect(authColors.backgroundBase, ColorTokens.light.backgroundBase);
      expect(lockerColors.primary, blueDefaultDark);
      expect(lockerColors.backgroundBase, ColorTokens.dark.backgroundBase);
    });

    testWidgets("uses configured app tokens when ThemeData has no extension", (
      tester,
    ) async {
      addTearDown(() => ComponentTheme.configure(app: ComponentApp.photos));
      ComponentTheme.configure(app: ComponentApp.locker);

      late ColorTokens colors;
      await tester.pumpWidget(
        Theme(
          data: ThemeData(brightness: Brightness.dark),
          child: Builder(
            builder: (context) {
              colors = context.componentColors;
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(colors.primary, blueDefaultDark);
      expect(colors.backgroundBase, ColorTokens.dark.backgroundBase);
    });
  });
}
