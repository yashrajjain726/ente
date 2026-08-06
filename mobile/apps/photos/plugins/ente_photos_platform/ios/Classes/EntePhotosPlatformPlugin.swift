import Flutter
import Foundation
import UIKit

public final class EntePhotosPlatformPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
  private let methodChannel: FlutterMethodChannel
  private let eventChannel: FlutterEventChannel
  private var eventSink: FlutterEventSink?
  private var observerTokens: [NSObjectProtocol] = []
  private var enabledBatteryMonitoring = false

  private init(registrar: FlutterPluginRegistrar) {
    methodChannel = FlutterMethodChannel(
      name: "io.ente.photos.platform",
      binaryMessenger: registrar.messenger()
    )
    eventChannel = FlutterEventChannel(
      name: "io.ente.photos.platform/device_health_events",
      binaryMessenger: registrar.messenger()
    )
    super.init()
  }

  public static func register(with registrar: FlutterPluginRegistrar) {
    let instance = EntePhotosPlatformPlugin(registrar: registrar)
    registrar.addMethodCallDelegate(instance, channel: instance.methodChannel)
    instance.eventChannel.setStreamHandler(instance)
    registrar.publish(instance)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "deviceHealth.getSnapshot":
      result(snapshotWithBatteryMonitoring())
    case "deviceHealth.getMemorySnapshot":
      result(memorySnapshot())
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  public func onListen(
    withArguments arguments: Any?,
    eventSink events: @escaping FlutterEventSink
  ) -> FlutterError? {
    stopObserving()
    eventSink = events
    startObserving()
    emitSnapshot()
    return nil
  }

  public func onCancel(withArguments arguments: Any?) -> FlutterError? {
    eventSink = nil
    stopObserving()
    return nil
  }

  public func detachFromEngine(for registrar: FlutterPluginRegistrar) {
    eventSink = nil
    stopObserving()
    methodChannel.setMethodCallHandler(nil)
    eventChannel.setStreamHandler(nil)
  }

  private func startObserving() {
    let device = UIDevice.current
    if !device.isBatteryMonitoringEnabled {
      device.isBatteryMonitoringEnabled = true
      enabledBatteryMonitoring = true
    }

    let center = NotificationCenter.default
    observerTokens = [
      center.addObserver(
        forName: UIDevice.batteryLevelDidChangeNotification,
        object: device,
        queue: .main
      ) { [weak self] _ in self?.emitSnapshot() },
      center.addObserver(
        forName: UIDevice.batteryStateDidChangeNotification,
        object: device,
        queue: .main
      ) { [weak self] _ in self?.emitSnapshot() },
      center.addObserver(
        forName: ProcessInfo.thermalStateDidChangeNotification,
        object: ProcessInfo.processInfo,
        queue: .main
      ) { [weak self] _ in self?.emitSnapshot() },
    ]
  }

  private func stopObserving() {
    for token in observerTokens {
      NotificationCenter.default.removeObserver(token)
    }
    observerTokens.removeAll()
    if enabledBatteryMonitoring {
      UIDevice.current.isBatteryMonitoringEnabled = false
      enabledBatteryMonitoring = false
    }
  }

  private func emitSnapshot() {
    guard let sink = eventSink else { return }
    if Thread.isMainThread {
      sink(snapshot())
    } else {
      DispatchQueue.main.async { [weak self] in
        guard let self, let sink = self.eventSink else { return }
        sink(self.snapshot())
      }
    }
  }

  private func snapshotWithBatteryMonitoring() -> [String: Any] {
    let device = UIDevice.current
    let restoreMonitoring = !device.isBatteryMonitoringEnabled
    if restoreMonitoring {
      device.isBatteryMonitoringEnabled = true
    }
    defer {
      if restoreMonitoring {
        device.isBatteryMonitoringEnabled = false
      }
    }
    return snapshot()
  }

  private func snapshot() -> [String: Any] {
    [
      "platform": "ios",
      "observedAtMs": Int64(Date().timeIntervalSince1970 * 1000),
      "battery": batterySnapshot(),
      "thermal": thermalSnapshot(),
    ]
  }

  private func batterySnapshot() -> [String: Any] {
    let level = UIDevice.current.batteryLevel
    guard level >= 0, level <= 1 else {
      return unavailable("battery_level_unavailable")
    }
    return [
      "status": "available",
      "levelPercent": Int(level * 100),
    ]
  }

  private func thermalSnapshot() -> [String: Any] {
    let state: String
    switch ProcessInfo.processInfo.thermalState {
    case .nominal:
      state = "nominal"
    case .fair:
      state = "moderate"
    case .serious:
      state = "serious"
    case .critical:
      state = "critical"
    @unknown default:
      return unavailable("thermal_status_unknown")
    }
    return ["status": "available", "state": state]
  }

  private func memorySnapshot() -> [String: Any] {
    let totalBytes = ProcessInfo.processInfo.physicalMemory
    guard totalBytes > 0 else {
      return unavailable("memory_total_missing")
    }
    return ["status": "available", "totalBytes": Int64(totalBytes)]
  }

  private func unavailable(_ errorCode: String) -> [String: Any] {
    ["status": "unavailable", "errorCode": errorCode]
  }
}
