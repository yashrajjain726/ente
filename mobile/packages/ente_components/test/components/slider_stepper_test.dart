import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:flutter/material.dart" as material show Slider;
import "package:flutter_test/flutter_test.dart";

void main() {
  testWidgets("SliderComponent clamps its rendered value", (tester) async {
    await tester.pumpWidget(
      _wrap(SliderComponent(value: 12, min: 0, max: 10, onChanged: (_) {})),
    );

    expect(
      tester.widget<material.Slider>(find.byType(material.Slider)).value,
      10,
    );
  });
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: ComponentTheme.lightTheme(),
    home: Scaffold(body: Center(child: child)),
  );
}
