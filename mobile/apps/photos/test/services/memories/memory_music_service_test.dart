import "dart:async";
import "dart:convert";

import "package:flutter_test/flutter_test.dart";
import "package:photos/services/memories/memory_music_service.dart";
import "package:shared_preferences/shared_preferences.dart";

const _manifestPreferenceKey = "memory_music_manifest";
const _cachedURL = "https://music.ente.com/cached.mp3";
const _newURL = "https://music.ente.com/new.mp3";
const _sharedURL = "https://music.ente.com/shared.mp3";

void main() {
  late SharedPreferences preferences;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    preferences = await SharedPreferences.getInstance();
  });

  test("sorts a valid manifest and caches each URL once", () async {
    final manifest = _manifest([
      _track("z-track", _sharedURL, title: "Zed"),
      _track("a-track", _sharedURL, artist: "Artist"),
      _track("middle-track", _newURL),
    ]);
    final cachedURLs = <String>[];
    final service = _service(
      preferences,
      fetchManifest: () async => manifest,
      cacheAsset: (url) async => cachedURLs.add(url),
    );

    final tracks = await service.prepare();

    expect(tracks.map((track) => track.id), [
      "a-track",
      "middle-track",
      "z-track",
    ]);
    expect(tracks.first.artist, "Artist");
    expect(tracks.last.title, "Zed");
    expect(cachedURLs, unorderedEquals([_sharedURL, _newURL]));
    expect(cachedURLs.where((url) => url == _sharedURL), hasLength(1));
    expect(
      jsonDecode(preferences.getString(_manifestPreferenceKey)!),
      manifest,
    );
  });

  test("uses a cached manifest after failure and retries refresh", () async {
    final cachedManifest = _manifest([_track("cached", _cachedURL)]);
    final refreshedManifest = _manifest([_track("new", _newURL)]);
    final cachedManifestJSON = jsonEncode(cachedManifest);
    await preferences.setString(_manifestPreferenceKey, cachedManifestJSON);
    var fetchCalls = 0;
    final deletedURLs = <String>[];
    final service = _service(
      preferences,
      fetchManifest: () async {
        fetchCalls++;
        if (fetchCalls == 1) throw StateError("offline");
        return refreshedManifest;
      },
      deleteAsset: (url) async => deletedURLs.add(url),
    );

    final fallbackTracks = await service.prepare();

    expect(fallbackTracks.map((track) => track.id), ["cached"]);
    expect(preferences.getString(_manifestPreferenceKey), cachedManifestJSON);
    expect(deletedURLs, isEmpty);

    final refreshedTracks = await service.prepare();

    expect(refreshedTracks.map((track) => track.id), ["new"]);
    expect(fetchCalls, 2);
    expect(deletedURLs, [_cachedURL]);
    expect(
      jsonDecode(preferences.getString(_manifestPreferenceKey)!),
      refreshedManifest,
    );
  });

  for (final invalidManifest in <(String, Object?)>[
    (
      "invalid entry",
      _manifest([
        <String, dynamic>{"id": "broken", "url": 42},
      ]),
    ),
    (
      "duplicate IDs",
      _manifest([
        _track("duplicate", "https://music.ente.com/first.mp3"),
        _track("duplicate", "https://music.ente.com/second.mp3"),
      ]),
    ),
  ]) {
    test("${invalidManifest.$1} preserves the cached manifest", () async {
      final cachedManifest = _manifest([_track("cached", _cachedURL)]);
      final cachedManifestJSON = jsonEncode(cachedManifest);
      await preferences.setString(_manifestPreferenceKey, cachedManifestJSON);
      final deletedURLs = <String>[];
      final service = _service(
        preferences,
        fetchManifest: () async => invalidManifest.$2,
        deleteAsset: (url) async => deletedURLs.add(url),
      );

      final tracks = await service.prepare();

      expect(tracks.map((track) => track.id), ["cached"]);
      expect(preferences.getString(_manifestPreferenceKey), cachedManifestJSON);
      expect(deletedURLs, isEmpty);
    });
  }

  test("an empty manifest removes each previously referenced URL", () async {
    await preferences.setString(
      _manifestPreferenceKey,
      jsonEncode(
        _manifest([
          _track("cached-a", _cachedURL),
          _track("cached-b", _cachedURL),
          _track("shared", _sharedURL),
        ]),
      ),
    );
    final cachedURLs = <String>[];
    final deletedURLs = <String>[];
    final emptyManifest = _manifest([]);
    final service = _service(
      preferences,
      fetchManifest: () async => emptyManifest,
      cacheAsset: (url) async => cachedURLs.add(url),
      deleteAsset: (url) async => deletedURLs.add(url),
    );

    final tracks = await service.prepare();

    expect(tracks, isEmpty);
    expect(cachedURLs, isEmpty);
    expect(deletedURLs, unorderedEquals([_cachedURL, _sharedURL]));
    expect(deletedURLs.where((url) => url == _cachedURL), hasLength(1));
    expect(
      jsonDecode(preferences.getString(_manifestPreferenceKey)!),
      emptyManifest,
    );
  });

  test("removes only URLs no longer shared by the new manifest", () async {
    await preferences.setString(
      _manifestPreferenceKey,
      jsonEncode(
        _manifest([
          _track("removed", _cachedURL),
          _track("old-shared-id", _sharedURL),
        ]),
      ),
    );
    final cachedURLs = <String>[];
    final deletedURLs = <String>[];
    final service = _service(
      preferences,
      fetchManifest: () async => _manifest([
        _track("new-shared-id", _sharedURL),
        _track("new", _newURL),
      ]),
      cacheAsset: (url) async => cachedURLs.add(url),
      deleteAsset: (url) async => deletedURLs.add(url),
    );

    final tracks = await service.prepare();

    expect(tracks.map((track) => track.id), ["new", "new-shared-id"]);
    expect(cachedURLs, unorderedEquals([_newURL, _sharedURL]));
    expect(deletedURLs, [_cachedURL]);
  });

  test(
    "filters an audio failure and retries it without refetching the manifest",
    () async {
      const firstURL = "https://music.ente.com/first.mp3";
      const secondURL = "https://music.ente.com/second.mp3";
      var fetchCalls = 0;
      final cacheAttempts = <String, int>{};
      final service = _service(
        preferences,
        fetchManifest: () async {
          fetchCalls++;
          return _manifest([
            _track("first", firstURL),
            _track("second", secondURL),
          ]);
        },
        cacheAsset: (url) async {
          final attempt = (cacheAttempts[url] ?? 0) + 1;
          cacheAttempts[url] = attempt;
          if (url == firstURL && attempt == 1) {
            throw StateError("download failed");
          }
        },
      );

      final firstTracks = await service.prepare();
      final retriedTracks = await service.prepare();

      expect(firstTracks.map((track) => track.id), ["second"]);
      expect(retriedTracks.map((track) => track.id), ["first", "second"]);
      expect(fetchCalls, 1);
      expect(cacheAttempts, <String, int>{firstURL: 2, secondURL: 2});
    },
  );

  test("concurrent preparation shares one manifest fetch", () async {
    final fetchStarted = Completer<void>();
    final finishFetch = Completer<void>();
    var fetchCalls = 0;
    var cacheCalls = 0;
    final service = _service(
      preferences,
      fetchManifest: () async {
        fetchCalls++;
        fetchStarted.complete();
        await finishFetch.future;
        return _manifest([_track("track", _newURL)]);
      },
      cacheAsset: (_) async => cacheCalls++,
    );

    final firstPreparation = service.prepare();
    await fetchStarted.future;
    final secondPreparation = service.prepare();

    expect(identical(firstPreparation, secondPreparation), isTrue);
    expect(fetchCalls, 1);

    finishFetch.complete();
    final results = await Future.wait([firstPreparation, secondPreparation]);

    expect(results[0].map((track) => track.id), ["track"]);
    expect(results[1].map((track) => track.id), ["track"]);
    expect(cacheCalls, 1);
  });
}

MemoryMusicService _service(
  SharedPreferences preferences, {
  required Future<Object?> Function() fetchManifest,
  Future<void> Function(String url)? cacheAsset,
  Future<void> Function(String url)? deleteAsset,
}) {
  return MemoryMusicService(
    preferences: preferences,
    fetchManifest: fetchManifest,
    cacheAsset: cacheAsset ?? (_) async {},
    deleteAsset: deleteAsset ?? (_) async {},
  );
}

Map<String, dynamic> _manifest(List<Map<String, dynamic>> tracks) => {
  "tracks": tracks,
};

Map<String, dynamic> _track(
  String id,
  Object url, {
  String? title,
  String? artist,
}) => {"id": id, "url": url, "title": ?title, "artist": ?artist};
