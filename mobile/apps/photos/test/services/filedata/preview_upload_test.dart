import "dart:convert";
import "dart:io";
import "dart:typed_data";

import "package:dio/dio.dart";
import "package:ente_feature_flag/ente_feature_flag.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/gateways/files/file_data_gateway.dart";
import "package:photos/services/filedata/preview_upload.dart";
import "package:shared_preferences/shared_preferences.dart";

const _payload = [1, 2, 3, 4];
const _checksum = "CNbAWiFRKnmh3+udKo8mLw==";
const _uploadURL = "https://storage.example.com/preview";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory directory;
  late File preview;
  late Dio dio;
  late _StorageAdapter adapter;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp("preview_upload_test_");
    preview = await File("${directory.path}/preview.ts").writeAsBytes(_payload);
    adapter = _StorageAdapter();
    dio = Dio(BaseOptions(baseUrl: "https://api.example.com"))
      ..httpClientAdapter = adapter;
  });

  tearDown(() async {
    dio.close();
    await directory.delete(recursive: true);
  });

  for (final scenario in [
    (name: "supported server", flags: {"serverApiFlag": 264}, useV2: true),
    (
      name: "older server, including internal users",
      flags: {"serverApiFlag": 8, "internalUser": true},
      useV2: false,
    ),
  ]) {
    test("uploads preview on ${scenario.name}", () async {
      SharedPreferences.setMockInitialValues({
        "remote_flags": jsonEncode(scenario.flags),
      });
      final prefs = await SharedPreferences.getInstance();
      final flags = FlagService(prefs, dio);
      expect(flags.previewUploadV2, scenario.useV2);

      final result = await uploadVideoPreview(
        preview,
        fileID: 42,
        gateway: FileDataGateway(dio),
        dio: dio,
        useUploadV2: flags.previewUploadV2,
      );

      expect(result, ("preview-id", _payload.length));
      expect(adapter.requests, hasLength(2));
      final urlRequest = adapter.requests.first;
      expect(urlRequest.path, "/files/data/preview-upload-url");
      expect(urlRequest.method, scenario.useV2 ? "POST" : "GET");
      if (scenario.useV2) {
        expect(jsonDecode(utf8.decode(adapter.bodies.first)), {
          "fileID": 42,
          "type": "vid_preview",
          "contentLength": _payload.length,
          "contentMD5": _checksum,
        });
      } else {
        expect(urlRequest.queryParameters, {
          "fileID": 42,
          "type": "vid_preview",
        });
      }
      final uploadRequest = adapter.requests.last;
      expect(uploadRequest.uri.toString(), _uploadURL);
      expect(uploadRequest.method, "PUT");
      final headers = uploadRequest.headers.map(
        (key, value) => MapEntry(key.toLowerCase(), value),
      );
      expect(headers[Headers.contentLengthHeader], _payload.length);
      expect(headers["content-md5"], scenario.useV2 ? _checksum : isNull);
      expect(adapter.bodies.last, _payload);
    });
  }

  test("honors cancellation between URL acquisition and upload", () async {
    final cancelToken = CancelToken();
    dio.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) {
          cancelToken.cancel("stopped");
          handler.next(response);
        },
      ),
    );

    await expectLater(
      uploadVideoPreview(
        preview,
        fileID: 42,
        gateway: FileDataGateway(dio),
        dio: dio,
        useUploadV2: true,
        cancelToken: cancelToken,
      ),
      throwsA(
        isA<DioException>().having(CancelToken.isCancel, "cancelled", isTrue),
      ),
    );
    expect(adapter.requests, hasLength(1));
  });
}

class _StorageAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  final bodies = <List<int>>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    bodies.add(await requestStream?.expand((chunk) => chunk).toList() ?? []);
    if (options.uri.host == "api.example.com") {
      return ResponseBody.fromString(
        jsonEncode({"objectID": "preview-id", "url": _uploadURL}),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString("", 200);
  }

  @override
  void close({bool force = false}) {}
}
