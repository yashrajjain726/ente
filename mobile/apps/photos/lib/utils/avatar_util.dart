import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";

enum AvatarIdentityRole { standard, currentUser, publicUploader }

class AvatarIdentity {
  AvatarIdentity({
    required this.label,
    String? email,
    int? userID,
    String? personID,
    this.role = AvatarIdentityRole.standard,
  }) : key = avatarIdentityKey(
         email: email,
         userID: userID,
         personID: personID,
         name: label,
       );

  final String label;
  final String key;
  final AvatarIdentityRole role;

  String get initial {
    final trimmed = label.trim();
    return trimmed.isEmpty ? " " : trimmed.characters.first.toUpperCase();
  }
}

String avatarIdentityKey({
  String? email,
  int? userID,
  String? personID,
  String? name,
}) {
  final normalizedEmail = normalizeAvatarEmail(email);
  if (normalizedEmail != null) {
    return "email:$normalizedEmail";
  }
  if (userID != null) {
    return "user:$userID";
  }
  final normalizedPersonID = personID?.trim();
  if (normalizedPersonID != null && normalizedPersonID.isNotEmpty) {
    return "person:$normalizedPersonID";
  }
  final normalizedName = name?.trim().toLowerCase().replaceAll(
    RegExp(r"\s+"),
    " ",
  );
  if (normalizedName != null && normalizedName.isNotEmpty) {
    return "name:$normalizedName";
  }
  return "unknown";
}

String? normalizeAvatarEmail(String? email) {
  final normalized = email?.trim().toLowerCase();
  if (normalized == null ||
      normalized.isEmpty ||
      normalized.endsWith("@unknown.com")) {
    return null;
  }
  return normalized;
}

Color avatarBackgroundColor(BuildContext context, AvatarIdentity identity) {
  return identity.role == AvatarIdentityRole.standard
      ? avatarColorForIdentity(context, identity.key)
      : Colors.black;
}
