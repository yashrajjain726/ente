import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:photos/core/configuration.dart';
import 'package:photos/core/errors.dart';
import 'package:photos/gateways/collections/models/collection_share.dart';
import 'package:photos/models/api/collection/user.dart';
import 'package:photos/models/collection/collection.dart';
import 'package:photos/models/metadata/common_keys.dart';
import 'package:photos/models/user_details.dart';
import 'package:photos/services/account/user_service.dart';
import 'package:photos/services/collections_service.dart';
import 'package:photos/services/library_sharing_local_store.dart';
import 'package:photos/services/library_sharing_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../ui/sharing/library_sharing_test_helpers.dart';

void main() {
  test('batches automatic shares and shares uncategorized as viewer', () async {
    final albums = [
      for (var id = 1; id <= 100; id++) librarySharingTestAlbum(id),
      librarySharingTestAlbum(101, type: CollectionType.uncategorized),
    ];
    final fixture = await _Fixture.create(albums, blockedIDs: {100, 101});

    expect(
      (await fixture.service.getEligibleAlbums()).last.type,
      CollectionType.uncategorized,
    );

    final result = await fixture.service.enableAutomaticSharing(
      recipient: librarySharingTestRecipient,
      role: CollectionParticipantRole.admin,
    );

    expect(result.failedIDs, isEmpty);
    expect(result.previouslyUnsharedIDs, {100, 101});
    expect(fixture.collectionsService.shareBatchSizes, [100, 1]);
    expect(fixture.collectionsService.recipientEmails, [
      librarySharingTestRecipient.email,
      librarySharingTestRecipient.email,
    ]);
    expect(fixture.userService.publicKeyEmails, [
      librarySharingTestRecipient.email,
    ]);
    expect(
      fixture.collectionsService.sharedRoles[101],
      CollectionParticipantRole.viewer,
    );
    final config = await fixture.readConfig();
    expect(config.addedAutomatically.length, 99);
    expect(config.unsharedBefore, {100, 101});
  });

  test('hidden automatic shares remain until explicitly unshared', () async {
    final album = librarySharingTestAlbum(1);
    final fixture = await _Fixture.create([album]);
    await fixture.service.enableAutomaticSharing(
      recipient: librarySharingTestRecipient,
      role: CollectionParticipantRole.viewer,
    );

    album.mMdVersion = 1;
    album.mMdEncodedJson = '{"visibility":$hiddenVisibility}';
    await fixture.service.reconcile();

    var config = await fixture.readConfig();
    expect(config.hidden, {album.id});
    expect(config.addedAutomatically, {album.id});
    expect(album.sharees, isNotEmpty);

    await fixture.service.unshareAlbumFromAll(album);

    config = await fixture.readConfig();
    expect(config.addedAutomatically, isEmpty);
    expect(config.unsharedBefore, {album.id});
    expect(album.sharees, isEmpty);

    album.mMdEncodedJson = '{"visibility":$visibleVisibility}';
    await fixture.service.reconcile();

    config = await fixture.readConfig();
    expect(config.hidden, {album.id});
    expect(config.addedAutomatically, isEmpty);
    expect(fixture.collectionsService.shareAttempts, [album.id]);
    expect(fixture.collectionsService.unshareAttempts, [album.id]);
    expect(album.sharees, isEmpty);
  });

  test(
    'stops automatic sharing when the recipient leaves the family',
    () async {
      final albums = [librarySharingTestAlbum(1)];
      final fixture = await _Fixture.create(
        albums,
        activeFamilyMemberUserIDs: {librarySharingTestRecipient.userID},
      );
      await fixture.service.enableAutomaticSharing(
        recipient: librarySharingTestRecipient,
        role: CollectionParticipantRole.viewer,
      );

      fixture.userService.activeFamilyMemberUserIDs = {};
      albums.add(librarySharingTestAlbum(2));
      await fixture.service.reconcile();

      expect(
        await fixture.service.isAutomaticSharingEnabled(
          librarySharingTestRecipient.userID,
        ),
        isFalse,
      );
      expect(albums.first.sharees, isNotEmpty);
      expect(albums.last.sharees, isEmpty);
    },
  );

  test('stops bulk sharing on a recipient identity mismatch', () async {
    final albums = [
      for (var id = 1; id <= 101; id++) librarySharingTestAlbum(id),
    ];
    final fixture = await _Fixture.create(
      albums,
      shareError: RecipientIdentityMismatchError(),
    );

    await expectLater(
      fixture.service.enableAutomaticSharing(
        recipient: librarySharingTestRecipient,
        role: CollectionParticipantRole.viewer,
      ),
      throwsA(isA<RecipientIdentityMismatchError>()),
    );

    expect(fixture.collectionsService.shareBatchSizes, [100]);
  });
}

class _Fixture {
  const _Fixture(
    this.service,
    this.collectionsService,
    this.store,
    this.userService,
  );

  final LibrarySharingService service;
  final _FakeCollectionsService collectionsService;
  final LibrarySharingLocalStore store;
  final _FakeUserService userService;

  static Future<_Fixture> create(
    List<Collection> albums, {
    Set<int> blockedIDs = const {},
    Set<int>? activeFamilyMemberUserIDs,
    Object? shareError,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final collectionsService = _FakeCollectionsService(
      albums,
      blockedIDs,
      shareError,
    );
    final store = LibrarySharingLocalStore(preferences);
    final userService = _FakeUserService(activeFamilyMemberUserIDs);
    return _Fixture(
      LibrarySharingService(
        collectionsService: collectionsService,
        userService: userService,
        configuration: _FakeConfiguration(),
        localStore: store,
      ),
      collectionsService,
      store,
      userService,
    );
  }

  Future<LibrarySharingLocalConfig> readConfig() async =>
      (await store.read(1, librarySharingTestRecipient.userID))!;
}

class _FakeCollectionsService extends Mock implements CollectionsService {
  _FakeCollectionsService(this.albums, this.blockedIDs, this.shareError);

  final List<Collection> albums;
  final Set<int> blockedIDs;
  final Object? shareError;
  final List<int> shareBatchSizes = [];
  final List<String> recipientEmails = [];
  final List<int> shareAttempts = [];
  final List<int> unshareAttempts = [];
  final Map<int, CollectionParticipantRole> sharedRoles = {};

  @override
  List<Collection> getCollectionsForUI({
    bool includedShared = false,
    bool includeCollab = false,
    bool includeUncategorized = false,
  }) => albums;

  @override
  Future<List<Collection>> orderCollectionsForAlbums(
    Iterable<Collection> collections,
  ) async => collections.toList().reversed.toList();

  @override
  List<Collection> getActiveCollections() => albums;

  @override
  Future<Map<int, CollectionShareStatus>> shareBulk({
    required int recipientUserID,
    required String recipientEmail,
    required String publicKey,
    required Map<int, CollectionParticipantRole> roles,
    required CollectionShareSource source,
  }) async {
    shareBatchSizes.add(roles.length);
    recipientEmails.add(recipientEmail);
    if (shareError != null) {
      throw shareError!;
    }
    shareAttempts.addAll(roles.keys);
    sharedRoles.addAll(roles);
    for (final entry in roles.entries) {
      if (blockedIDs.contains(entry.key)) {
        continue;
      }
      albums
          .firstWhere((album) => album.id == entry.key)
          .sharees
          .add(
            User(
              id: recipientUserID,
              email: recipientEmail,
              role: entry.value.toStringVal(),
            ),
          );
    }
    return {
      for (final collectionID in roles.keys)
        collectionID: blockedIDs.contains(collectionID)
            ? CollectionShareStatus.blockedPreviousRemoval
            : CollectionShareStatus.shared,
    };
  }

  @override
  Future<Map<int, CollectionShareStatus>> unshareBulk({
    required int recipientUserID,
    required List<int> collectionIDs,
    required CollectionShareSource source,
  }) async {
    unshareAttempts.addAll(collectionIDs);
    for (final id in collectionIDs) {
      albums
          .firstWhere((album) => album.id == id)
          .sharees
          .removeWhere((sharee) => sharee.id == recipientUserID);
    }
    return {for (final id in collectionIDs) id: CollectionShareStatus.unshared};
  }

  @override
  Collection? getCollectionByID(int collectionID) =>
      albums.firstWhere((album) => album.id == collectionID);
}

class _FakeUserService extends Mock implements UserService {
  _FakeUserService(this.activeFamilyMemberUserIDs);

  Set<int>? activeFamilyMemberUserIDs;
  final List<String> publicKeyEmails = [];

  @override
  Future<String?> getPublicKey(String email) async {
    publicKeyEmails.add(email);
    return email == librarySharingTestRecipient.email ? 'public-key' : null;
  }

  @override
  List<User> getRelevantContacts() => [
    User(
      id: librarySharingTestRecipient.userID,
      email: librarySharingTestRecipient.email,
    ),
  ];

  @override
  UserDetails? getCachedUserDetails() {
    final userIDs = activeFamilyMemberUserIDs;
    return userIDs == null ? null : _FakeUserDetails(userIDs);
  }
}

class _FakeUserDetails extends Mock implements UserDetails {
  _FakeUserDetails(Set<int> activeFamilyMemberUserIDs)
    : familyData = FamilyData(
        [
          for (final userID in activeFamilyMemberUserIDs)
            FamilyMember(
              '$userID@example.com',
              0,
              '$userID',
              userID,
              false,
              FamilyMemberStatus.accepted,
              null,
            ),
        ],
        0,
        0,
        0,
      );

  @override
  final FamilyData familyData;
}

class _FakeConfiguration extends Mock implements Configuration {
  @override
  int? getUserID() => 1;
}
