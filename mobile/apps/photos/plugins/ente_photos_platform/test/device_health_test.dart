import 'package:ente_photos_platform/ente_photos_platform.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('parses a complete Android observation', () {
    final snapshot = DeviceHealthSnapshot.fromMap(
      _snapshotMap(platform: 'android'),
    );

    expect(snapshot.platform, DeviceHealthPlatform.android);
    expect(snapshot.battery.levelPercent, 64);
    expect(snapshot.battery.temperatureCelsius, 31.5);
    expect(snapshot.battery.health, DeviceBatteryHealth.good);
    expect(snapshot.thermal.state, DeviceThermalState.moderate);
  });

  test('accepts iOS battery observations without private metrics', () {
    final snapshot = DeviceHealthSnapshot.fromMap(
      _snapshotMap(
        platform: 'ios',
        battery: {'status': 'available', 'levelPercent': 80},
      ),
    );

    expect(snapshot.battery.temperatureCelsius, isNull);
    expect(snapshot.battery.health, isNull);
  });

  test('rejects available battery observations without a valid level', () {
    expect(
      () => DeviceHealthSnapshot.fromMap(
        _snapshotMap(battery: {'status': 'available'}),
      ),
      throwsFormatException,
    );
    expect(
      () => DeviceHealthSnapshot.fromMap(
        _snapshotMap(battery: {'status': 'available', 'levelPercent': 101}),
      ),
      throwsFormatException,
    );
  });

  test('rejects values attached to unavailable signals', () {
    expect(
      () => DeviceHealthSnapshot.fromMap(
        _snapshotMap(thermal: {'status': 'unsupported', 'state': 'nominal'}),
      ),
      throwsFormatException,
    );
  });

  test('requires errors only for unavailable signals', () {
    expect(
      () => DeviceHealthSnapshot.fromMap(
        _snapshotMap(battery: {'status': 'unavailable'}),
      ),
      throwsFormatException,
    );
    expect(
      () => DeviceHealthSnapshot.fromMap(
        _snapshotMap(
          thermal: {
            'status': 'available',
            'state': 'nominal',
            'errorCode': 'unexpected',
          },
        ),
      ),
      throwsFormatException,
    );
  });

  test('source requests typed health and memory snapshots', () async {
    const channel = MethodChannel('device-health-source-test');
    final methods = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          methods.add(call.method);
          return switch (call.method) {
            'deviceHealth.getSnapshot' => _snapshotMap(),
            'deviceHealth.getMemorySnapshot' => {
              'status': 'available',
              'totalBytes': 8 * 1024 * 1024 * 1024,
            },
            _ => throw MissingPluginException(),
          };
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null),
    );

    final source = EntePhotosDeviceHealth(methodChannel: channel);
    expect((await source.getSnapshot()).battery.levelPercent, 64);
    expect(
      (await source.getMemorySnapshot()).totalBytes,
      8 * 1024 * 1024 * 1024,
    );
    expect(methods, [
      'deviceHealth.getSnapshot',
      'deviceHealth.getMemorySnapshot',
    ]);
  });
}

Map<String, Object?> _snapshotMap({
  String platform = 'android',
  Map<String, Object?>? battery,
  Map<String, Object?>? thermal,
}) => {
  'platform': platform,
  'observedAtMs': 1800000000000,
  'battery':
      battery ??
      {
        'status': 'available',
        'levelPercent': 64,
        'temperatureCelsius': 31.5,
        'health': 'good',
      },
  'thermal': thermal ?? {'status': 'available', 'state': 'moderate'},
};
