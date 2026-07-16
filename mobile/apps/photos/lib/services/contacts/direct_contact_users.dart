import "package:ente_contacts/contacts.dart" as contacts;
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/models/user_details.dart";
import "package:photos/utils/contact_string_util.dart";

List<User> buildDirectContactUsers({
  required int ownerUserId,
  required String ownerEmail,
  required Iterable<Collection> collections,
  required Iterable<FamilyMember> familyMembers,
  required Iterable<contacts.ContactRecord> savedContacts,
}) {
  final ownerNormalizedEmail = normalizeContactLinkEmail(
    knownContactEmailOrNull(ownerEmail),
  );
  final usersByEmail = <String, User>{};

  void addUser(User user) {
    final normalizedEmail = normalizeContactLinkEmail(
      knownContactEmailOrNull(user.email),
    );
    if (normalizedEmail == null || normalizedEmail == ownerNormalizedEmail) {
      return;
    }

    final existing = usersByEmail[normalizedEmail];
    final hasUserId = user.id != null && user.id! > 0;
    final existingHasUserId = existing?.id != null && existing!.id! > 0;
    if (existing == null || (!existingHasUserId && hasUserId)) {
      usersByEmail[normalizedEmail] = user;
    }
  }

  for (final collection in collections) {
    if (collection.isOwner(ownerUserId)) {
      for (final sharee in collection.sharees) {
        addUser(sharee);
      }
    } else {
      addUser(collection.owner);
    }
  }

  for (final member in familyMembers) {
    if (member.isActive) {
      addUser(User(id: member.userID, email: member.email));
    }
  }

  for (final contact in savedContacts) {
    final email = contact.email;
    if (email != null) {
      addUser(User(id: contact.contactUserId, email: email));
    }
  }

  return usersByEmail.values.toList(growable: false);
}
