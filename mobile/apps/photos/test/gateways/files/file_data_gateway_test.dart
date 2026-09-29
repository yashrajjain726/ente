import "dart:io";

import "package:dio/dio.dart";
import "package:flutter_test/flutter_test.dart";
import "package:photos/core/network/api_response.dart";
import "package:photos/gateways/files/file_data_gateway.dart";

void main() {
  for (final publicCollection in [false, true]) {
    group(publicCollection ? "public file data" : "private file data", () {
      late HttpServer server;
      late Dio dio;
      late FileDataGateway gateway;
      late String baseUrl;
      late HttpRequest lastRequest;
      late int status;
      late String body;

      setUp(() async {
        status = HttpStatus.ok;
        body =
            '{"data":{"encryptedData":"cipher","decryptionHeader":"header"}}';
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        baseUrl = "http://${server.address.host}:${server.port}";
        server.listen((request) async {
          lastRequest = request;
          request.response.statusCode = status;
          if (status == HttpStatus.ok) {
            request.response.headers.contentType = ContentType.json;
          }
          request.response.write(body);
          await request.response.close();
        });
        dio = Dio(BaseOptions(baseUrl: baseUrl))
          ..interceptors.add(ApiResponseInterceptor(baseUrl));
        gateway = FileDataGateway(dio);
      });

      tearDown(() async {
        dio.close(force: true);
        await server.close(force: true);
      });

      Future<Object?> fetch() {
        if (publicCollection) {
          return gateway.fetchPublicFileData(
            baseUrl: baseUrl,
            fileID: 42,
            type: "vid_preview",
            headers: {"X-Auth-Access-Token": "public-token"},
            nonEnteDio: dio,
          );
        }
        return gateway.fetchSingleFileData(fileID: 42, type: "vid_preview");
      }

      test("requests no-content responses and parses available data", () async {
        expect(await fetch(), (
          encryptedData: "cipher",
          decryptionHeader: "header",
        ));
        expect(
          lastRequest.uri.path,
          publicCollection
              ? "/public-collection/files/data/fetch"
              : "/files/data/fetch",
        );
        expect(lastRequest.uri.queryParameters, {
          "fileID": "42",
          "type": "vid_preview",
          "preferNoContent": "true",
        });
        if (publicCollection) {
          expect(
            lastRequest.headers.value("X-Auth-Access-Token"),
            "public-token",
          );
        }
      });

      test("handles an empty 204 before parsing", () async {
        status = HttpStatus.noContent;
        body = "";
        expect(await fetch(), isNull);
      });
    });
  }
}
