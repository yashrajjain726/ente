import 'package:ente_photos_platform/ente_photos_platform.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photos/services/machine_learning/device_health_policy.dart';

void main() {
  const policy = DeviceHealthPolicy();
  final now = DateTime(2026, 8, 6, 12);

  test('accepts fresh healthy Android evidence', () {
    expect(policy.evaluate(_snapshot(now), now: now).issues, isEmpty);
  });

  test('rejects stale and future observations', () {
    expect(
      policy
          .evaluate(
            _snapshot(now.subtract(const Duration(minutes: 3))),
            now: now,
          )
          .issues,
      {DeviceHealthIssue.staleObservation},
    );
    expect(
      policy
          .evaluate(
            _snapshot(now.add(const Duration(milliseconds: 1))),
            now: now,
          )
          .issues,
      {DeviceHealthIssue.staleObservation},
    );
  });

  test('rejects unavailable or low battery evidence', () {
    expect(
      policy
          .evaluate(
            _snapshot(
              now,
              battery: const DeviceBatterySnapshot(
                status: DeviceSignalStatus.unavailable,
                errorCode: 'battery_read_failed',
              ),
            ),
            now: now,
          )
          .issues,
      contains(DeviceHealthIssue.batteryUnavailable),
    );
    expect(
      policy
          .evaluate(
            _snapshot(now, battery: _androidBattery(level: 19)),
            now: now,
          )
          .issues,
      contains(DeviceHealthIssue.lowBattery),
    );
  });

  test('rejects hot or unknown Android battery evidence', () {
    expect(
      policy
          .evaluate(
            _snapshot(now, battery: _androidBattery(temperature: 42.1)),
            now: now,
          )
          .issues,
      contains(DeviceHealthIssue.batteryTooHot),
    );
    expect(
      policy
          .evaluate(
            _snapshot(
              now,
              battery: _androidBattery(health: DeviceBatteryHealth.unknown),
            ),
            now: now,
          )
          .issues,
      contains(DeviceHealthIssue.batteryHealthUnavailable),
    );
  });

  test('rejects serious thermal state', () {
    expect(
      policy
          .evaluate(
            _snapshot(
              now,
              thermal: const DeviceThermalSnapshot(
                status: DeviceSignalStatus.available,
                state: DeviceThermalState.serious,
              ),
            ),
            now: now,
          )
          .issues,
      contains(DeviceHealthIssue.thermalTooHigh),
    );
  });

  test('uses Android battery evidence when thermal APIs are unsupported', () {
    final evaluation = policy.evaluate(
      _snapshot(
        now,
        thermal: const DeviceThermalSnapshot(
          status: DeviceSignalStatus.unsupported,
        ),
      ),
      now: now,
    );

    expect(evaluation.issues, isEmpty);
  });

  test('accepts iOS without Android-only battery metrics', () {
    final evaluation = policy.evaluate(
      _snapshot(
        now,
        platform: DeviceHealthPlatform.ios,
        battery: const DeviceBatterySnapshot(
          status: DeviceSignalStatus.available,
          levelPercent: 80,
        ),
      ),
      now: now,
    );

    expect(evaluation.issues, isEmpty);
  });

  test('does not treat unsupported iOS thermal evidence as healthy', () {
    final evaluation = policy.evaluate(
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
      now: now,
    );

    expect(evaluation.issues, contains(DeviceHealthIssue.thermalUnavailable));
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
