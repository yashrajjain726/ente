import 'package:flutter_test/flutter_test.dart';
import 'package:locker/services/collections/models/collection.dart';
import 'package:locker/services/collections/models/collection_change.dart';

void main() {
  group('isSharedCollectionDeletion', () {
    test('accepts sparse and legacy full foreign deletions', () {
      final sparse = {
        'id': 7,
        'owner': {'id': 1},
        'updationTime': 9,
        'isDeleted': true,
      };
      final legacyFull = {
        ...sparse,
        'encryptedKey': 'compatibility-key',
        'keyDecryptionNonce': 'nonce',
        'type': 'album',
        'attributes': <String, dynamic>{},
        'name': 'Deleted Collection',
      };

      expect(isSharedCollectionDeletion(sparse, 2), isTrue);
      expect(isSharedCollectionDeletion(legacyFull, 2), isTrue);
    });

    test('keeps owned deletions and active collections as updates', () {
      final ownedDeletion = {
        'id': 7,
        'owner': {'id': 2, 'email': 'owner@example.com'},
        'encryptedKey': 'owned-key',
        'keyDecryptionNonce': 'owned-nonce',
        'name': 'Deleted Collection',
        'encryptedName': 'encrypted-name',
        'nameDecryptionNonce': 'name-nonce',
        'type': 'folder',
        'attributes': <String, dynamic>{},
        'sharees': <Map<String, dynamic>>[],
        'publicURLs': <Map<String, dynamic>>[],
        'updationTime': 9,
        'isDeleted': true,
      };
      final active = {
        ...ownedDeletion,
        'id': 8,
        'owner': {'id': 1},
        'isDeleted': false,
      };

      expect(isSharedCollectionDeletion(ownedDeletion, 2), isFalse);
      expect(isSharedCollectionDeletion(active, 2), isFalse);

      final collection = Collection.fromMap(ownedDeletion);
      expect(collection.encryptedKey, 'owned-key');
      expect(collection.keyDecryptionNonce, 'owned-nonce');
      expect(collection.isDeleted, isTrue);
    });
  });
}
