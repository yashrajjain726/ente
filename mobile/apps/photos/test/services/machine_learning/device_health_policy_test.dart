import 'package:ente_photos_platform/ente_photos_platform.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photos/services/machine_learning/device_health_policy.dart';

void main() {
  const policy = DeviceHealthPolicy();
  final now = DateTime(2026, 8, 6, 12);
  Set<DeviceHealthIssue> issues(DeviceHealthSnapshot snapshot) =>
      policy.evaluate(snapshot, now: now).issues;

  test('accepts fresh healthy Android evidence', () {
    expect(issues(_snapshot(now)), isEmpty);
  });

  test('rejects stale and future observations', () {
    for (final observedAt in [
      now.subtract(const Duration(minutes: 3)),
      now.add(const Duration(milliseconds: 1)),
    ]) {
      expect(issues(_snapshot(observedAt)), {
        DeviceHealthIssue.staleObservation,
      });
    }
  });

  test('rejects unavailable or low battery evidence', () {
    expect(
      issues(
        _snapshot(
          now,
          battery: const DeviceBatterySnapshot(
            status: DeviceSignalStatus.unavailable,
            errorCode: 'battery_read_failed',
          ),
        ),
      ),
      contains(DeviceHealthIssue.batteryUnavailable),
    );
    expect(
      issues(_snapshot(now, battery: _androidBattery(level: 19))),
      contains(DeviceHealthIssue.lowBattery),
    );
  });

  test('accepts unsupported iOS battery evidence', () {
    expect(
      issues(
        _snapshot(
          now,
          platform: DeviceHealthPlatform.ios,
          battery: const DeviceBatterySnapshot(
            status: DeviceSignalStatus.unsupported,
          ),
        ),
      ),
      isEmpty,
    );
  });

  test('rejects hot or unknown Android battery evidence', () {
    expect(
      issues(_snapshot(now, battery: _androidBattery(temperature: 42.1))),
      contains(DeviceHealthIssue.batteryTooHot),
    );
    expect(
      issues(
        _snapshot(
          now,
          battery: _androidBattery(health: DeviceBatteryHealth.unknown),
        ),
      ),
      contains(DeviceHealthIssue.batteryHealthUnavailable),
    );
  });

  test('rejects serious thermal state', () {
    expect(
      issues(
        _snapshot(
          now,
          thermal: const DeviceThermalSnapshot(
            status: DeviceSignalStatus.available,
            state: DeviceThermalState.serious,
          ),
        ),
      ),
      contains(DeviceHealthIssue.thermalTooHigh),
    );
  });

  test('uses Android battery evidence when thermal APIs are unsupported', () {
    expect(
      issues(
        _snapshot(
          now,
          thermal: const DeviceThermalSnapshot(
            status: DeviceSignalStatus.unsupported,
          ),
        ),
      ),
      isEmpty,
    );
  });

  test('accepts iOS without Android-only battery metrics', () {
    expect(
      issues(
        _snapshot(
          now,
          platform: DeviceHealthPlatform.ios,
          battery: const DeviceBatterySnapshot(
            status: DeviceSignalStatus.available,
            levelPercent: 80,
          ),
        ),
      ),
      isEmpty,
    );
  });

  test('does not treat unsupported iOS thermal evidence as healthy', () {
    expect(
      issues(
        _snapshot(
          now,
          platform: DeviceHealthPlatform.ios,
          battery: const DeviceBatterySnapshot(
            status: DeviceSignalStatus.available,
            levelPercent: 80,
          ),
          thermal: const DeviceThermalSnapshot(
            status: DeviceSignalStatus.unsupported,
          ),
        ),
      ),
      contains(DeviceHealthIssue.thermalUnavailable),
    );
  });
}

DeviceHealthSnapshot _snapshot(
  DateTime observedAt, {
  DeviceHealthPlatform platform = DeviceHealthPlatform.android,
  DeviceBatterySnapshot? battery,
  DeviceThermalSnapshot? thermal,
}) => DeviceHealthSnapshot(
  platform: platform,
  observedAt: observedAt,
  battery: battery ?? _androidBattery(),
  thermal:
      thermal ??
      const DeviceThermalSnapshot(
        status: DeviceSignalStatus.available,
        state: DeviceThermalState.nominal,
      ),
);

DeviceBatterySnapshot _androidBattery({
  int level = 80,
  double temperature = 30,
  DeviceBatteryHealth health = DeviceBatteryHealth.good,
}) => DeviceBatterySnapshot(
  status: DeviceSignalStatus.available,
  levelPercent: level,
  temperatureCelsius: temperature,
  health: health,
);
