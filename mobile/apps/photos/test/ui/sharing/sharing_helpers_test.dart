import 'package:ente_components/ente_components.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photos/models/api/collection/user.dart';
import 'package:photos/models/collection/collection.dart';
import 'package:photos/ui/sharing/share_components.dart';
import 'package:photos/ui/sharing/widgets/participant_row.dart';
import 'package:photos/ui/sharing/widgets/sharing_role.dart';

void main() {
  test('normalizes sharing emails for identity comparisons', () {
    expect(
      normalizedSharingEmail(' Friend@Example.COM '),
      'friend@example.com',
    );
  });

  group('collectionNeedsShare', () {
    final collection = _collection([
      User(
        id: 2,
        email: ' Collaborator@Example.com ',
        role: CollectionParticipantRole.collaborator.toStringVal(),
      ),
    ]);

    test('rejects the owner and existing sharees after normalization', () {
      expect(collectionNeedsShare(collection, ' OWNER@example.com '), isFalse);
      expect(
        collectionNeedsShare(collection, 'collaborator@example.COM'),
        isFalse,
      );
    });

    test('accepts a recipient without access', () {
      expect(collectionNeedsShare(collection, 'new@example.com'), isTrue);
    });
  });

  test('sorts sharees by role and then email', () {
    final collection = _collection([
      User(id: 4, email: 'z-viewer@example.com'),
      User(
        id: 3,
        email: 'collaborator@example.com',
        role: CollectionParticipantRole.collaborator.toStringVal(),
      ),
      User(
        id: 2,
        email: 'b-admin@example.com',
        role: CollectionParticipantRole.admin.toStringVal(),
      ),
      User(
        id: 5,
        email: 'a-admin@example.com',
        role: CollectionParticipantRole.admin.toStringVal(),
      ),
    ]);

    expect(sortedCollectionSharees(collection).map((user) => user.id), [
      5,
      2,
      3,
      4,
    ]);
  });

  testWidgets('participant roster builds rows lazily', (tester) async {
    final builtRows = <int>{};

    await tester.pumpWidget(
      _testApp(
        ScrollableParticipantRoster(
          rows: [
            for (var index = 0; index < 60; index++)
              Builder(
                builder: (context) {
                  builtRows.add(index);
                  return ShareMenuItem(
                    key: ValueKey('participant-$index'),
                    title: 'Participant $index',
                    trailing: const SizedBox.square(
                      dimension: kMinInteractiveDimension,
                    ),
                    isDisabled: true,
                  );
                },
              ),
          ],
        ),
      ),
    );

    expect(builtRows.length, lessThan(60));
    expect(find.byKey(const ValueKey('participant-59')), findsNothing);

    await tester.drag(
      find.byKey(const ValueKey('participant-roster-scroll')),
      const Offset(0, -5000),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('participant-59')), findsOneWidget);
  });
}

Widget _testApp(Widget child) {
  return MaterialApp(
    theme: ComponentTheme.lightTheme(),
    home: Scaffold(
      body: Align(
        alignment: Alignment.topLeft,
        child: SizedBox(width: 400, child: child),
      ),
    ),
  );
}

Collection _collection(List<User> sharees) {
  return Collection(
    1,
    User(id: 1, email: 'owner@example.com'),
    '',
    null,
    'Album',
    null,
    null,
    CollectionType.album,
    CollectionAttributes(),
    sharees,
    [],
    1,
  );
}
