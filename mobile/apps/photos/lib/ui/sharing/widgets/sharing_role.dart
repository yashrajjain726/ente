import "package:hugeicons/hugeicons.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";

List<List<dynamic>> sharingRoleIcon(CollectionParticipantRole role) {
  return switch (role) {
    CollectionParticipantRole.owner ||
    CollectionParticipantRole.admin => HugeIcons.strokeRoundedCrown,
    CollectionParticipantRole.collaborator => HugeIcons.strokeRoundedUserGroup,
    CollectionParticipantRole.viewer ||
    CollectionParticipantRole.unknown => HugeIcons.strokeRoundedView,
  };
}

int sharingRoleRank(CollectionParticipantRole role) {
  return switch (role) {
    CollectionParticipantRole.owner => -1,
    CollectionParticipantRole.admin => 0,
    CollectionParticipantRole.collaborator => 1,
    CollectionParticipantRole.viewer || CollectionParticipantRole.unknown => 2,
  };
}

List<User> sortedCollectionSharees(Collection collection) {
  final sharees = List<User>.from(collection.sharees);
  sharees.sort((a, b) {
    final rankComparison = sharingRoleRank(
      collection.getRole(a.id),
    ).compareTo(sharingRoleRank(collection.getRole(b.id)));
    return rankComparison != 0
        ? rankComparison
        : a.email.toLowerCase().compareTo(b.email.toLowerCase());
  });
  return sharees;
}
