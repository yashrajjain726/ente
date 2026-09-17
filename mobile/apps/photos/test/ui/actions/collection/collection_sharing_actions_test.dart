import "package:dio/dio.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:package_info_plus/package_info_plus.dart";
import "package:photos/core/configuration.dart";
import "package:photos/core/errors.dart";
import "package:photos/core/network/api_response.dart";
import "package:photos/ente_theme_data.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/collections_service.dart";
import "package:photos/ui/actions/collection/collection_sharing_actions.dart";
import "package:shared_preferences/shared_preferences.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _KeyRequests keys;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({
      "email": "owner@example.com",
      "remote_flags": "{}",
    });
    final preferences = await SharedPreferences.getInstance();
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          keys.respond(options, handler);
        },
      ),
    );
    ServiceLocator.instance.init(
      preferences,
      dio,
      Dio(),
      Dio(),
      PackageInfo(
        appName: "Photos",
        packageName: "photos",
        version: "1.0.0",
        buildNumber: "1",
      ),
    );
    // These actions only need Configuration's preferences-backed email.
    // The remaining platform initialization is unavailable in widget tests.
    try {
      await Configuration.instance.init(preferences);
    } catch (_) {}
    // Construct the flag refresher outside the widget-test fake clock.
    expect(flagService.internalUser, isTrue);
  });

  setUp(() async {
    keys = _KeyRequests();
    await localSettings.setInternalUserDisabled(false);
  });

  for (final role in [
    CollectionParticipantRole.viewer,
    CollectionParticipantRole.collaborator,
    CollectionParticipantRole.admin,
  ]) {
    testWidgets("shares both albums with both recipients as ${role.name}", (
      tester,
    ) async {
      final context = await _pumpContext(tester);
      final service = _SharingService();
      final albums = [_Album(1), _Album(2)];
      final emails = {"${role.name}1@example.com", "${role.name}2@example.com"};
      albums.first.sharees = [User(id: 1, email: emails.first, role: "VIEWER")];

      final result = CollectionActions(
        service,
      ).addEmailsToCollections(context, albums, emails, role);
      await tester.pumpAndSettle();

      expect(await result, emails);
      expect(keys.requests.map((request) => request.path), [
        "/users/public-keys",
      ]);
      expect(service.calls.map((call) => call.$1), [1, 2]);
      for (final call in service.calls) {
        expect(call.$2.keys, unorderedEquals(emails));
        expect(call.$3, role);
      }
      for (final album in albums) {
        expect(
          album.sharees.map((user) => user.email),
          unorderedEquals(emails),
        );
        expect(
          album.sharees.every((user) => user.role == role.toStringVal()),
          isTrue,
        );
      }
    });
  }

  testWidgets(
    "batch 404 resolves individually and excludes the missing account",
    (tester) async {
      final context = await _pumpContext(tester);
      final service = _SharingService();
      keys.missing.add("missing@example.com");
      final result = CollectionActions(service).addEmailsToCollections(
        context,
        [_Album(1)],
        {"present@example.com", "missing@example.com"},
        CollectionParticipantRole.viewer,
      );
      await tester.pumpAndSettle();

      expect(find.text(context.strings.inviteToEnte), findsOneWidget);
      expect(service.calls, isEmpty);
      Navigator.of(context).pop();
      await tester.pumpAndSettle();

      expect(await result, {"present@example.com"});
      expect(service.calls.single.$2.keys, ["present@example.com"]);
      expect(keys.requests.map((request) => request.path), [
        "/users/public-keys",
        "/users/public-key",
        "/users/public-key",
      ]);
    },
  );

  testWidgets("non-internal users use batch key lookup", (tester) async {
    await localSettings.setInternalUserDisabled(true);
    expect(flagService.internalUser, isFalse);
    final context = await _pumpContext(tester);
    final emails = {"regular1@example.com", "regular2@example.com"};
    final result = CollectionActions(_SharingService()).addEmailsToCollections(
      context,
      [_Album(1)],
      emails,
      CollectionParticipantRole.viewer,
    );
    await tester.pumpAndSettle();

    expect(await result, emails);
    expect(keys.requests.map((request) => request.path), [
      "/users/public-keys",
    ]);
  });

  testWidgets("unavailable batch endpoint falls back to single-key lookups", (
    tester,
  ) async {
    await localSettings.setInternalUserDisabled(true);
    keys.batchUnavailable = true;
    final context = await _pumpContext(tester);
    final emails = {"legacy1@example.com", "legacy2@example.com"};
    final result = CollectionActions(_SharingService()).addEmailsToCollections(
      context,
      [_Album(1)],
      emails,
      CollectionParticipantRole.viewer,
    );
    await tester.pumpAndSettle();

    expect(await result, emails);
    expect(keys.requests.map((request) => request.path), [
      "/users/public-keys",
      "/users/public-key",
      "/users/public-key",
    ]);
  });

  for (final failedAlbum in [1, 2]) {
    testWidgets(
      "batch failure on album $failedAlbum returns no success count",
      (tester) async {
        final context = await _pumpContext(tester);
        final service = _SharingService()
          ..errors[failedAlbum] = StateError("share failed");
        final albums = [_Album(1), _Album(2)];
        final emails = {
          for (var index = 0; index < 11; index++)
            "batch${failedAlbum}_$index@example.com",
        };
        final result = CollectionActions(service).addEmailsToCollections(
          context,
          albums,
          emails,
          CollectionParticipantRole.collaborator,
        );
        await tester.pumpAndSettle();

        expect(find.text(context.strings.error), findsOneWidget);
        Navigator.of(context).pop();
        await tester.pumpAndSettle();

        expect(await result, isEmpty);
        expect(service.calls, hasLength(failedAlbum));
        expect(service.singleCalls, isEmpty);
        expect(albums.first.sharees, hasLength(failedAlbum == 1 ? 0 : 11));
        expect(albums.last.sharees, isEmpty);
        expect(
          keys.requests.map(
            (request) => (request.data["emails"] as List).length,
          ),
          [10, 1],
        );
      },
    );
  }

  for (final upgradeRequired in [false, true]) {
    testWidgets(
      "legacy fallback continues after ${upgradeRequired ? 'subscription' : 'recipient'} failure",
      (tester) async {
        final context = await _pumpContext(tester);
        final emails = {
          for (var index = 0; index < 3; index++)
            "legacy${upgradeRequired}_$index@example.com",
        };
        final service = _SharingService()
          ..errors[1] = _unexpectedResponse(404)
          ..singleErrors[(1, emails.elementAt(1))] = upgradeRequired
              ? SharingNotPermittedForFreeAccountsError()
              : StateError("share failed");
        final album = _Album(1);
        final result = CollectionActions(service).addEmailsToCollections(
          context,
          [album],
          emails,
          CollectionParticipantRole.collaborator,
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            upgradeRequired
                ? context.strings.subscribeToEnableSharing
                : context.strings.error,
          ),
          findsOneWidget,
        );
        Navigator.of(context).pop();
        await tester.pumpAndSettle();

        expect(await result, {emails.first, emails.last});
        expect(service.calls, hasLength(1));
        expect(service.singleCalls.map((call) => call.$2), emails.toList());
        expect(album.sharees.map((user) => user.email), [
          emails.first,
          emails.last,
        ]);
        expect(
          service.singleCalls.every(
            (call) => call.$3 == CollectionParticipantRole.collaborator,
          ),
          isTrue,
        );
      },
    );
  }

  testWidgets(
    "legacy fallback retains recipient-first album order and results",
    (tester) async {
      final context = await _pumpContext(tester);
      final emails = {"order1@example.com", "order2@example.com"};
      final service = _SharingService()
        ..errors[1] = _unexpectedResponse(404)
        ..singleErrors[(1, emails.first)] = StateError("share failed");
      final albums = [_Album(1), _Album(2)];
      final result = CollectionActions(service).addEmailsToCollections(
        context,
        albums,
        emails,
        CollectionParticipantRole.viewer,
      );
      await tester.pumpAndSettle();
      expect(find.text(context.strings.error), findsOneWidget);
      Navigator.of(context).pop();
      await tester.pumpAndSettle();

      // The previous picker counted the last album's result for each recipient.
      expect(await result, emails);
      expect(service.singleCalls.map((call) => (call.$1, call.$2)), [
        (1, emails.first),
        (2, emails.first),
        (1, emails.last),
        (2, emails.last),
      ]);
      expect(service.calls, hasLength(1));
      expect(albums.first.sharees.map((user) => user.email), [emails.last]);
      expect(albums.last.sharees.map((user) => user.email), emails.toList());
    },
  );

  for (final unexpected in [false, true]) {
    testWidgets("does not fall back for ${unexpected ? '503' : 'API 404'}", (
      tester,
    ) async {
      final context = await _pumpContext(tester);
      final request = RequestOptions(path: "/collections/share/batch");
      final service = _SharingService()
        ..errors[1] = unexpected
            ? _unexpectedResponse(503)
            : DioException(
                requestOptions: request,
                response: Response<dynamic>(
                  requestOptions: request,
                  statusCode: 404,
                  data: {"code": "NOT_FOUND"},
                ),
                type: DioExceptionType.badResponse,
              );
      final result = CollectionActions(service).addEmailsToCollections(
        context,
        [_Album(1)],
        {"no-fallback-$unexpected@example.com"},
        CollectionParticipantRole.viewer,
      );
      await tester.pumpAndSettle();
      expect(find.text(context.strings.error), findsOneWidget);
      Navigator.of(context).pop();
      await tester.pumpAndSettle();

      expect(await result, isEmpty);
      expect(service.singleCalls, isEmpty);
    });
  }

  testWidgets("subscription failures show the existing upgrade prompt", (
    tester,
  ) async {
    final context = await _pumpContext(tester);
    final service = _SharingService()
      ..errors[1] = SharingNotPermittedForFreeAccountsError();
    final result = CollectionActions(service).addEmailsToCollections(
      context,
      [_Album(1)],
      {"free@example.com"},
      CollectionParticipantRole.viewer,
    );
    await tester.pumpAndSettle();

    expect(find.text(context.strings.subscribeToEnableSharing), findsOneWidget);
    expect(find.text(context.strings.subscribe), findsOneWidget);
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(await result, isEmpty);
  });
}

UnexpectedApiResponseException _unexpectedResponse(int status) {
  final request = RequestOptions(path: "/collections/share/batch");
  return UnexpectedApiResponseException(
    request,
    Response<String>(
      requestOptions: request,
      statusCode: status,
      data: "endpoint unavailable",
    ),
    DioExceptionType.badResponse,
  );
}

Future<BuildContext> _pumpContext(WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: lightThemeData,
      localizationsDelegates: StringsLocalizations.localizationsDelegates,
      supportedLocales: StringsLocalizations.supportedLocales,
      home: const Scaffold(body: SizedBox(key: ValueKey("host"))),
    ),
  );
  return tester.element(find.byKey(const ValueKey("host")));
}

class _KeyRequests {
  final requests = <RequestOptions>[];
  final missing = <String>{};
  bool batchUnavailable = false;

  void respond(RequestOptions options, RequestInterceptorHandler handler) {
    requests.add(options);
    final batch = options.path == "/users/public-keys";
    final emails = batch
        ? (options.data["emails"] as List).cast<String>()
        : [options.queryParameters["email"] as String];
    if ((batch && batchUnavailable) || emails.any(missing.contains)) {
      handler.reject(
        DioException(
          requestOptions: options,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: 404,
            data: <String, dynamic>{},
          ),
          type: DioExceptionType.badResponse,
        ),
      );
    } else {
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: batch
              ? {"publicKeys": emails.map((email) => "key-$email").toList()}
              : {"publicKey": "key-${emails.single}"},
        ),
      );
    }
  }
}

class _SharingService extends Fake implements CollectionsService {
  final calls = <(int, Map<String, String>, CollectionParticipantRole)>[];
  final errors = <int, Object>{};
  final singleCalls = <(int, String, CollectionParticipantRole)>[];
  final singleErrors = <(int, String), Object>{};
  final _sharees = <int, List<User>>{};

  @override
  Future<List<User>> shareBatch(
    int collectionID,
    Map<String, String> publicKeys,
    CollectionParticipantRole role,
  ) async {
    calls.add((collectionID, Map.of(publicKeys), role));
    final error = errors[collectionID];
    if (error != null) throw error;
    final emails = publicKeys.keys.toList();
    return [
      for (var index = 0; index < emails.length; index++)
        User(id: index + 1, email: emails[index], role: role.toStringVal()),
    ];
  }

  @override
  Future<List<User>> share(
    int collectionID,
    String email,
    String publicKey,
    CollectionParticipantRole role,
  ) async {
    singleCalls.add((collectionID, email, role));
    final error = singleErrors[(collectionID, email)];
    if (error != null) throw error;
    final sharees = _sharees.putIfAbsent(collectionID, () => []);
    sharees.add(
      User(id: sharees.length + 1, email: email, role: role.toStringVal()),
    );
    return List.of(sharees);
  }
}

class _Album extends Fake implements Collection {
  _Album(this.id);

  @override
  final int id;

  @override
  List<User> sharees = [];

  @override
  void updateSharees(List<User> users) => sharees = users;
}
