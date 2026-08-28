import 'package:flutter/services.dart';

class CountryNames {
  const CountryNames({required this.region, required this.names});

  final String? region;
  final Map<String, String> names;
}

class CountryNamesClient {
  static const _channel = MethodChannel(
    'io.ente.photos.platform/country_names',
  );

  static Future<CountryNames> get(String locale) async {
    final result = await _channel.invokeMapMethod<String, dynamic>(
      'get',
      locale,
    );
    return CountryNames(
      region: result!['region'] as String?,
      names: (result['names'] as Map).cast<String, String>(),
    );
  }
}
