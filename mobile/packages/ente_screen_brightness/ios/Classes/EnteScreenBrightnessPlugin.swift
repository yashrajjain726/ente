import Flutter
import UIKit

public class EnteScreenBrightnessPlugin: NSObject, FlutterPlugin {
    private var capturedScreen: UIScreen?
    private var capturedBrightness: CGFloat?

    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(restoreForAppDeactivation(_:)),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(restoreForAppDeactivation(_:)),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
    }

    public static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(
            name: "io.ente.screen_brightness",
            binaryMessenger: registrar.messenger()
        )
        let instance = EnteScreenBrightnessPlugin()
        registrar.addMethodCallDelegate(instance, channel: channel)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "setBrightness":
            guard let number = call.arguments as? NSNumber else {
                result(FlutterError(
                    code: "INVALID_BRIGHTNESS",
                    message: "Brightness must be a number from 0 to 1.",
                    details: nil
                ))
                return
            }

            let brightness = CGFloat(number.doubleValue)
            guard brightness.isFinite, (0...1).contains(brightness) else {
                result(FlutterError(
                    code: "INVALID_BRIGHTNESS",
                    message: "Brightness must be a number from 0 to 1.",
                    details: nil
                ))
                return
            }

            guard UIApplication.shared.applicationState == .active else {
                result(false)
                return
            }

            guard let screen = activeScreen() else {
                result(FlutterError(
                    code: "SCREEN_UNAVAILABLE",
                    message: "No active iOS screen is available.",
                    details: nil
                ))
                return
            }

            if capturedBrightness == nil {
                capturedScreen = screen
                capturedBrightness = screen.brightness
            }
            screen.brightness = min(screen.brightness, brightness)
            result(true)

        case "restoreBrightness":
            restoreCapturedBrightness()
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func activeScreen() -> UIScreen? {
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .screen
    }

    @objc private func restoreForAppDeactivation(_ notification: Notification) {
        restoreCapturedBrightness()
    }

    private func restoreCapturedBrightness() {
        guard let screen = capturedScreen,
              let brightness = capturedBrightness else { return }
        screen.brightness = brightness
        capturedScreen = nil
        capturedBrightness = nil
    }

    deinit {
        restoreCapturedBrightness()
        NotificationCenter.default.removeObserver(self)
    }
}
