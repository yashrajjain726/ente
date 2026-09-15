import 'package:locker/services/collections/models/collection.dart';

sealed class CollectionChange {
  const CollectionChange(this.id, this.updationTime);

  final int id;
  final int updationTime;
}

final class CollectionUpdate extends CollectionChange {
  CollectionUpdate(this.collection)
    : super(collection.id, collection.updationTime);

  final Collection collection;
}

final class CollectionDeletion extends CollectionChange {
  const CollectionDeletion(super.id, super.updationTime);
}

bool isSharedCollectionDeletion(
  Map<String, dynamic> collectionData,
  int currentUserID,
) {
  final ownerID =
      (collectionData['owner'] as Map<String, dynamic>)['id'] as int;
  return collectionData['isDeleted'] == true && ownerID != currentUserID;
}
