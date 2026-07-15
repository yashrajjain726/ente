import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/utils/avatar_util.dart";

void main() {
  test("email identity is normalized and independent of the label", () {
    final before = AvatarIdentity.account(
      label: "Alice",
      email: " Alice@Example.com ",
      userID: 7,
      personID: "person-1",
      currentUserEmail: null,
    );
    final after = AvatarIdentity.account(
      label: "Bob",
      email: "alice@example.com",
      userID: null,
      currentUserEmail: null,
    );

    expect(before.key, "email:alice@example.com");
    expect(after.key, before.key);
    expect(after.initial, "B");
  });

  test("falls back through stable IDs before name", () {
    expect(
      AvatarIdentity.account(
        label: "Alice",
        email: "unknown@unknown.com",
        userID: 7,
        currentUserEmail: null,
      ).key,
      "user:7",
    );
    expect(
      avatarIdentityKey(personID: "person-1", name: "Alice"),
      "person:person-1",
    );
    expect(avatarIdentityKey(name: "  Alice   Smith "), "name:alice smith");
    expect(avatarIdentityKey(userID: -1, name: "Alice"), "name:alice");
  });

  test("anonymous identity is independent of its display name", () {
    final before = AvatarIdentity.account(
      label: "Alice",
      email: " Anon-1@unknown.com ",
      userID: -1,
      currentUserEmail: null,
    );
    final after = AvatarIdentity.account(
      label: "Bob",
      email: "anon-1@unknown.com",
      userID: -1,
      currentUserEmail: null,
    );

    expect(before.key, "anonymous:anon-1");
    expect(after.key, before.key);
    expect(after.role, AvatarIdentityRole.standard);
  });

  test("marks the signed-in email as the current-user role", () {
    final identity = AvatarIdentity.account(
      label: "Alice",
      email: " Alice@Example.com ",
      userID: 7,
      currentUserEmail: "alice@example.com",
    );

    expect(identity.role, AvatarIdentityRole.currentUser);
    expect(identity.key, "email:alice@example.com");
  });

  testWidgets("semantic avatar roles stay black across themes", (tester) async {
    for (final theme in [
      ComponentTheme.lightTheme(),
      ComponentTheme.darkTheme(),
    ]) {
      for (final identity in [
        AvatarIdentity.account(
          label: "A",
          email: "alice@example.com",
          userID: 7,
          currentUserEmail: "alice@example.com",
        ),
        AvatarIdentity.publicUploader(label: "A"),
      ]) {
        late Color backgroundColor;
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Builder(
              builder: (context) {
                backgroundColor = avatarBackgroundColor(context, identity);
                return const SizedBox.shrink();
              },
            ),
          ),
        );
        expect(backgroundColor, Colors.black);
      }
    }
  });
}
