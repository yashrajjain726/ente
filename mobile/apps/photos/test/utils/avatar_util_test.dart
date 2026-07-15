import "package:flutter_test/flutter_test.dart";
import "package:photos/utils/avatar_util.dart";

void main() {
  test("prefers normalized email for avatar identity", () {
    expect(
      avatarIdentityKey(
        email: " Alice@Example.com ",
        userID: 7,
        personID: "person-1",
        name: "Alice",
      ),
      "email:alice@example.com",
    );
  });

  test("falls back through stable IDs before name", () {
    expect(
      avatarIdentityKey(
        email: "unknown@unknown.com",
        userID: 7,
        personID: "person-1",
        name: "Alice",
      ),
      "user:7",
    );
    expect(
      avatarIdentityKey(personID: "person-1", name: "Alice"),
      "person:person-1",
    );
    expect(avatarIdentityKey(name: "  Alice   Smith "), "name:alice smith");
  });

  test("display name changes do not change email identity", () {
    final before = AvatarIdentity(label: "Alice", email: "alice@example.com");
    final after = AvatarIdentity(
      label: "Alice Smith",
      email: "alice@example.com",
    );

    expect(after.key, before.key);
    expect(after.initial, "A");
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
}
