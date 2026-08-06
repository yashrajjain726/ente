import 'dart:io';

import 'package:ente_photos_platform/ente_photos_platform.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native device health snapshot is current and usable', (
    tester,
  ) async {
    final snapshot = await EntePhotosDeviceHealth.instance.getSnapshot();
    final memory = await EntePhotosDeviceHealth.instance.getMemorySnapshot();
    final now = DateTime.now();

    expect(snapshot.isFreshAt(now, const Duration(seconds: 10)), isTrue);
    expect(memory.status, DeviceSignalStatus.available);
    expect(memory.totalBytes, greaterThan(0));
    expect(snapshot.thermal.status, isNot(DeviceSignalStatus.unavailable));
    if (Platform.isAndroid) {
      expect(snapshot.platform, DeviceHealthPlatform.android);
      expect(snapshot.battery.status, DeviceSignalStatus.available);
    } else if (Platform.isIOS) {
      expect(snapshot.platform, DeviceHealthPlatform.ios);
    }
  });
}
