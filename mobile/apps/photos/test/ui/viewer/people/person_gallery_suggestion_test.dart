import "dart:async";

import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/events/people_changed_event.dart";
import "package:photos/models/ml/face/person.dart";
import "package:photos/services/machine_learning/face_ml/feedback/cluster_feedback.dart";
import "package:photos/ui/viewer/people/person_gallery_suggestion.dart";

void main() {
  testWidgets("reloads after a suggestion is reviewed", (tester) async {
    final person = PersonEntity("person-1", PersonData(name: "Alex"));
    var suggestions = [
      ClusterSuggestion(person, "cluster-1", 0.1, false, [], []),
    ];

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: StringsLocalizations.localizationsDelegates,
        supportedLocales: StringsLocalizations.supportedLocales,
        home: Scaffold(
          body: PersonGallerySuggestion(
            person: person,
            loadSuggestions: (_) async => suggestions,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey("suggestion_0")), findsOneWidget);

    suggestions = [];
    Bus.instance.fire(
      PeopleChangedEvent(
        person: person,
        type: PeopleEventType.reviewedSuggestion,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey("suggestion_0")), findsNothing);
  });

  testWidgets("ignores reviews for another person", (tester) async {
    final person = PersonEntity("person-1", PersonData(name: "Alex"));
    final otherPerson = PersonEntity("person-2", PersonData(name: "Sam"));
    final suggestions = [
      ClusterSuggestion(person, "cluster-1", 0.1, false, [], []),
    ];
    var loadCount = 0;

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: StringsLocalizations.localizationsDelegates,
        supportedLocales: StringsLocalizations.supportedLocales,
        home: Scaffold(
          body: PersonGallerySuggestion(
            person: person,
            loadSuggestions: (_) async {
              loadCount++;
              return suggestions;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    Bus.instance.fire(
      PeopleChangedEvent(
        person: otherPerson,
        type: PeopleEventType.reviewedSuggestion,
      ),
    );
    await tester.pumpAndSettle();

    expect(loadCount, 1);
    expect(find.byKey(const ValueKey("suggestion_0")), findsOneWidget);
  });

  testWidgets("keeps the latest review reload result", (tester) async {
    final person = PersonEntity("person-1", PersonData(name: "Alex"));
    final suggestion = ClusterSuggestion(
      person,
      "cluster-1",
      0.1,
      false,
      [],
      [],
    );
    final firstReload = Completer<List<ClusterSuggestion>>();
    final secondReload = Completer<List<ClusterSuggestion>>();
    var loadCount = 0;

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: StringsLocalizations.localizationsDelegates,
        supportedLocales: StringsLocalizations.supportedLocales,
        home: Scaffold(
          body: PersonGallerySuggestion(
            person: person,
            loadSuggestions: (_) {
              loadCount++;
              return switch (loadCount) {
                1 => Future.value([suggestion]),
                2 => firstReload.future,
                _ => secondReload.future,
              };
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final event = PeopleChangedEvent(
      person: person,
      type: PeopleEventType.reviewedSuggestion,
    );
    Bus.instance.fire(event);
    Bus.instance.fire(event);
    await tester.pump();

    secondReload.complete([]);
    await tester.pumpAndSettle();
    firstReload.complete([suggestion]);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey("suggestion_0")), findsNothing);
  });
}
