import "dart:async";
import "dart:convert";

import "package:dio/dio.dart";
import "package:ente_feature_flag/ente_feature_flag.dart";
import "package:flutter_test/flutter_test.dart";
import "package:shared_preferences/shared_preferences.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test("feature flags follow preference changes across accounts", () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final service = FlagService(preferences, Dio(), autoRefresh: false);

    await preferences.setString(
      "remote_flags",
      jsonEncode({"customDomain": "first.example"}),
    );
    expect(service.flags.customDomain, "first.example");

    await preferences.setString(
      "remote_flags",
      jsonEncode({"customDomain": "second.example"}),
    );
    expect(service.flags.customDomain, "second.example");

    await preferences.remove("remote_flags");
    expect(service.flags.customDomain, isEmpty);
  });

  test("an account switch discards an in-flight flag response", () async {
    SharedPreferences.setMockInitialValues({
      "token": "account-a-token",
      "user_id": 1,
    });
    final preferences = await SharedPreferences.getInstance();
    final firstRequestStarted = Completer<void>();
    final firstResponse = Completer<Map<String, dynamic>>();
    var requestCount = 0;
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requestCount++;
          if (requestCount == 1) {
            firstRequestStarted.complete();
            firstResponse.future.then((data) {
              handler.resolve(
                Response<dynamic>(
                  requestOptions: options,
                  data: data,
                  statusCode: 200,
                ),
              );
            });
          } else {
            handler.resolve(
              Response<dynamic>(
                requestOptions: options,
                data: {
                  "internalUser": false,
                  "customDomain": "account-b.example",
                },
                statusCode: 200,
              ),
            );
          }
        },
      ),
    );
    final service = FlagService(preferences, dio, autoRefresh: false);

    final accountARefresh = service.tryRefreshFlags();
    await firstRequestStarted.future;
    expect(requestCount, 1);

    await preferences.clear();
    await preferences.setString("token", "account-b-token");
    await preferences.setInt("user_id", 2);
    final accountBRefresh = service.tryRefreshFlags();

    firstResponse.complete({
      "internalUser": true,
      "customDomain": "account-a.example",
    });
    await Future.wait([accountARefresh, accountBRefresh]);

    expect(requestCount, 2);
    expect(service.flags.internalUser, isFalse);
    expect(service.flags.customDomain, "account-b.example");
  });
}
