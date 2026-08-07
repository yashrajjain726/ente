import 'package:ente_contacts/contacts.dart';
import "package:ente_sharing/models/user.dart";

typedef ResolvedUserIdentity = ({String displayName, String email});

extension UserExtension on User {
  String get nameOrEmail {
    return email.substring(0, email.indexOf("@"));
  }

  String get resolvedDisplayName => resolvedUserDisplayName(id, email);

  String get resolvedEmail => resolvedUserEmail(id, email);

  bool matchesResolvedNameOrEmail(String query) =>
      _matchesResolvedNameOrEmail(id, email, query);
}

extension UserSuggestionExtension on UserSuggestion {
  String get resolvedDisplayName => resolvedUserDisplayName(userID, email);

  String get resolvedEmail => resolvedUserEmail(userID, email);

  bool matchesResolvedNameOrEmail(String query) =>
      _matchesResolvedNameOrEmail(userID, email, query);
}

String resolvedUserDisplayName(int? userID, String email) {
  return resolveUserIdentity(userID, email).displayName;
}

String resolvedUserEmail(int? userID, String email) {
  return resolveUserIdentity(userID, email).email;
}

ResolvedUserIdentity resolveUserIdentity(int? userID, String email) {
  final contact = ContactsDisplayService.instance.getCachedContact(
    contactUserId: userID,
    email: email,
  );
  final resolvedEmail = _trimToNull(contact?.email) ?? email;
  return (
    displayName: _trimToNull(contact?.data?.name) ?? resolvedEmail,
    email: resolvedEmail,
  );
}

bool _matchesResolvedNameOrEmail(int? userID, String email, String query) {
  final normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.isEmpty) return true;
  final identity = resolveUserIdentity(userID, email);
  return identity.displayName.toLowerCase().contains(normalizedQuery) ||
      identity.email.toLowerCase().contains(normalizedQuery) ||
      email.toLowerCase().contains(normalizedQuery);
}

String? _trimToNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}
