import 'package:ente_contacts/contacts.dart';
import 'package:photos/src/rust/third_party/ente_frb_core.dart';

Session? _session;
String? _sessionKey;

Session authenticatedSession(ContactsSession account) {
  final key = '${account.baseUrl}|${account.userId}';
  final current = _session;
  if (current != null && _sessionKey == key) {
    current.updateAuthToken(authToken: account.authToken);
    return current;
  }

  final opened = openSession(
    baseUrl: account.baseUrl,
    authToken: account.authToken,
    masterKey: account.accountKey,
    userAgent: account.userAgent,
    clientPackage: account.clientPackage,
    clientVersion: account.clientVersion,
  );
  _session = opened;
  _sessionKey = key;
  return opened;
}
