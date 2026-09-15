import 'package:flutter_test/flutter_test.dart';
import 'package:photos/gateways/collections/models/collection_change.dart';

void main() {
  const currentUserID = 2;

  test('classifies a full legacy foreign deletion as a tombstone', () {
    final data = _fullCollection(ownerID: 1, isDeleted: true);

    final change = RemoteCollectionChange.fromMap(data, currentUserID);

    expect(change, isA<RemoteCollectionDeletion>());
    _expectDeletion(change as RemoteCollectionDeletion);
  });

  test('classifies the compatibility sparse deletion as a tombstone', () {
    final change = RemoteCollectionChange.fromMap({
      'id': 7,
      'owner': {'id': 1, 'email': ''},
      'encryptedKey': 'compatibility-key',
      'type': 'album',
      'attributes': <String, dynamic>{},
      'updationTime': 9,
      'isDeleted': true,
    }, currentUserID);

    expect(change, isA<RemoteCollectionDeletion>());
    _expectDeletion(change as RemoteCollectionDeletion);
  });

  test('classifies a future minimal foreign deletion as a tombstone', () {
    final change = RemoteCollectionChange.fromMap({
      'id': 7,
      'owner': {'id': 1},
      'updationTime': 9,
      'isDeleted': true,
    }, currentUserID);

    expect(change, isA<RemoteCollectionDeletion>());
    _expectDeletion(change as RemoteCollectionDeletion);
  });

  test('retains an active foreign collection as an update', () {
    final data = _fullCollection(ownerID: 1, isDeleted: false);

    final change = RemoteCollectionChange.fromMap(data, currentUserID);

    expect(change, isA<RemoteCollectionUpdate>());
    expect((change as RemoteCollectionUpdate).data, same(data));
  });

  test('retains a full owned deletion as an update', () {
    final data = _fullCollection(ownerID: currentUserID, isDeleted: true);

    final change = RemoteCollectionChange.fromMap(data, currentUserID);

    expect(change, isA<RemoteCollectionUpdate>());
    expect((change as RemoteCollectionUpdate).data, same(data));
  });
}

Map<String, dynamic> _fullCollection({
  required int ownerID,
  required bool isDeleted,
}) => <String, dynamic>{
  'id': 7,
  'owner': {'id': ownerID, 'email': 'owner@example.com'},
  'encryptedKey': 'encrypted-key',
  'name': '',
  'encryptedName': 'encrypted-name',
  'nameDecryptionNonce': 'name-nonce',
  'type': 'album',
  'attributes': <String, dynamic>{},
  'sharees': <dynamic>[],
  'publicURLs': <dynamic>[],
  'updationTime': 9,
  'isDeleted': isDeleted,
};

void _expectDeletion(RemoteCollectionDeletion deletion) {
  expect(deletion.id, 7);
  expect(deletion.ownerID, 1);
  expect(deletion.updationTime, 9);
}
