sealed class RemoteCollectionChange {
  const RemoteCollectionChange();

  int get id;
  int get updationTime;

  factory RemoteCollectionChange.fromMap(
    Map<String, dynamic> map,
    int currentUserID,
  ) {
    final owner = map['owner'] as Map<String, dynamic>;
    if (map['isDeleted'] == true && owner['id'] as int != currentUserID) {
      return RemoteCollectionDeletion(
        id: map['id'] as int,
        ownerID: owner['id'] as int,
        updationTime: map['updationTime'] as int,
      );
    }
    return RemoteCollectionUpdate(map);
  }
}

final class RemoteCollectionUpdate extends RemoteCollectionChange {
  const RemoteCollectionUpdate(this.data);

  final Map<String, dynamic> data;

  @override
  int get id => data['id'] as int;

  @override
  int get updationTime => data['updationTime'] as int;
}

final class RemoteCollectionDeletion extends RemoteCollectionChange {
  const RemoteCollectionDeletion({
    required this.id,
    required this.ownerID,
    required this.updationTime,
  });

  @override
  final int id;
  final int ownerID;
  @override
  final int updationTime;
}
