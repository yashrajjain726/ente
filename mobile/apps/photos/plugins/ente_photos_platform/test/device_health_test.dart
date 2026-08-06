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
    expect(
      snapshot.isFreshAt(
        snapshot.observedAt.add(const Duration(seconds: 30)),
        const Duration(minutes: 1),
      ),
      isTrue,
    );
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

  test('future observations are not fresh', () {
    final snapshot = DeviceHealthSnapshot.fromMap(_snapshotMap());
    expect(
      snapshot.isFreshAt(
        snapshot.observedAt.subtract(const Duration(milliseconds: 1)),
        const Duration(minutes: 1),
      ),
      isFalse,
    );
  });

  test('source requests and parses the typed native snapshot', () async {
    const channel = MethodChannel('device-health-test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'deviceHealth.getSnapshot');
          return _snapshotMap();
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null),
    );

    final source = EntePhotosDeviceHealth(methodChannel: channel);
    expect((await source.getSnapshot()).battery.levelPercent, 64);
  });

  test('source requests and parses physical memory separately', () async {
    const channel = MethodChannel('device-memory-test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'deviceHealth.getMemorySnapshot');
          return {'status': 'available', 'totalBytes': 8 * 1024 * 1024 * 1024};
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null),
    );

    final source = EntePhotosDeviceHealth(methodChannel: channel);
    expect(
      (await source.getMemorySnapshot()).totalBytes,
      8 * 1024 * 1024 * 1024,
    );
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
