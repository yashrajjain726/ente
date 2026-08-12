@preconcurrency import Flutter
import Foundation

@MainActor
public final class PhotosPlatformPlugin: NSObject, @preconcurrency FlutterPlugin {
    private let methodChannel: FlutterMethodChannel
    private let eventChannel: FlutterEventChannel
    private let healthService = DeviceHealthService()
    private var eventSink: FlutterEventSink?
    private let processLockInstanceId = UUID().uuidString

    private init(registrar: FlutterPluginRegistrar) {
        methodChannel = FlutterMethodChannel(
            name: Self.methodChannelName,
            binaryMessenger: registrar.messenger()
        )
        eventChannel = FlutterEventChannel(
            name: Self.eventChannelName,
            binaryMessenger: registrar.messenger()
        )
        super.init()
    }

    public static func register(with registrar: FlutterPluginRegistrar) {
        let instance = PhotosPlatformPlugin(registrar: registrar)
        registrar.addMethodCallDelegate(instance, channel: instance.methodChannel)
        instance.eventChannel.setStreamHandler(instance)
        registrar.publish(instance)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "deviceHealth.getSnapshot":
            result(healthService.snapshot().channelValue)
        case "deviceHealth.getMemorySnapshot":
            result(healthService.memorySnapshot().memoryChannelValue)
        case "processLock.tryAcquire":
            handleProcessLockTryAcquire(call, result: result)
        case "processLock.release":
            handleProcessLockRelease(call, result: result)
        case "processLock.state":
            handleProcessLockState(call, result: result)
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func handleProcessLockTryAcquire(
        _ call: FlutterMethodCall,
        result: FlutterResult
    ) {
        guard let args = call.arguments as? [String: Any],
              let name = args["name"] as? String, !name.isEmpty,
              let origin = args["origin"] as? String, !origin.isEmpty,
              let operation = args["operation"] as? String, !operation.isEmpty
        else {
            result(
                FlutterError(
                    code: "invalidArguments",
                    message: "name, origin and operation are required",
                    details: nil
                )
            )
            return
        }
        result(
            ProcessLockRegistry.shared.tryAcquire(
                name: name,
                instanceId: processLockInstanceId,
                origin: origin,
                operation: operation
            )
        )
    }

    private func handleProcessLockRelease(
        _ call: FlutterMethodCall,
        result: FlutterResult
    ) {
        guard let args = call.arguments as? [String: Any],
              let name = args["name"] as? String, !name.isEmpty
        else {
            result(
                FlutterError(
                    code: "invalidArguments",
                    message: "name is required",
                    details: nil
                )
            )
            return
        }
        result(ProcessLockRegistry.shared.release(name: name, instanceId: processLockInstanceId))
    }

    private func handleProcessLockState(
        _ call: FlutterMethodCall,
        result: FlutterResult
    ) {
        guard let args = call.arguments as? [String: Any],
              let name = args["name"] as? String, !name.isEmpty
        else {
            result(
                FlutterError(
                    code: "invalidArguments",
                    message: "name is required",
                    details: nil
                )
            )
            return
        }
        result(ProcessLockRegistry.shared.state(name: name))
    }

    public func detachFromEngine(for registrar: FlutterPluginRegistrar) {
        ProcessLockRegistry.shared.releaseAll(instanceId: processLockInstanceId)
        eventSink = nil
        healthService.stopObserving()
        methodChannel.setMethodCallHandler(nil)
        eventChannel.setStreamHandler(nil)
    }

    private static let methodChannelName = "io.ente.photos.platform"
    private static let eventChannelName = "io.ente.photos.platform/device_health_events"
}

extension PhotosPlatformPlugin: @preconcurrency FlutterStreamHandler {
    public func onListen(
        withArguments arguments: Any?,
        eventSink events: @escaping FlutterEventSink
    ) -> FlutterError? {
        eventSink = events
        healthService.startObserving { [weak self] snapshot in
            self?.eventSink?(snapshot.channelValue)
        }
        return nil
    }

    public func onCancel(withArguments arguments: Any?) -> FlutterError? {
        eventSink = nil
        healthService.stopObserving()
        return nil
    }
}

private extension DeviceHealthSnapshot {
    var channelValue: [String: Any] {
        [
            "platform": "ios",
            "observedAtMs": Int64(observedAt.timeIntervalSince1970 * 1000),
            "battery": battery.batteryChannelValue,
            "thermal": thermal.thermalChannelValue,
        ]
    }
}

private extension DeviceSignal where Value == BatteryReading {
    var batteryChannelValue: [String: Any] {
        switch self {
        case .available(let reading):
            return [
                "status": "available",
                "levelPercent": reading.levelPercent,
            ]
        case .unsupported:
            return ["status": "unsupported"]
        case .unavailable(let error):
            return error.channelValue
        }
    }
}

private extension DeviceSignal where Value == ThermalState {
    var thermalChannelValue: [String: Any] {
        switch self {
        case .available(let state):
            return ["status": "available", "state": state.channelValue]
        case .unsupported:
            return ["status": "unsupported"]
        case .unavailable(let error):
            return error.channelValue
        }
    }
}

private extension DeviceSignal where Value == UInt64 {
    var memoryChannelValue: [String: Any] {
        switch self {
        case .available(let totalBytes):
            return ["status": "available", "totalBytes": Int64(totalBytes)]
        case .unsupported:
            return ["status": "unsupported"]
        case .unavailable(let error):
            return error.channelValue
        }
    }
}

private extension DeviceHealthError {
    var channelValue: [String: Any] {
        ["status": "unavailable", "errorCode": errorCode]
    }

    var errorCode: String {
        switch self {
        case .batteryLevelUnavailable: "battery_level_unavailable"
        case .thermalStatusUnknown: "thermal_status_unknown"
        case .memoryTotalMissing: "memory_total_missing"
        }
    }
}

private extension ThermalState {
    var channelValue: String {
        switch self {
        case .nominal: "nominal"
        case .moderate: "moderate"
        case .serious: "serious"
        case .critical: "critical"
        }
    }
}
