import 'dart:typed_data';

class ContactsSession {
  final String baseUrl;
  final String authToken;
  final int userId;
  final Uint8List accountKey;
  final String? userAgent;
  final String? clientPackage;
  final String? clientVersion;

  ContactsSession({
    required this.baseUrl,
    required this.authToken,
    required this.userId,
    required this.accountKey,
    this.userAgent,
    this.clientPackage,
    this.clientVersion,
  });
}
