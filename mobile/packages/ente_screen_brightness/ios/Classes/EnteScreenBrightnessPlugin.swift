import Flutter
import UIKit

public final class EnteScreenBrightnessPlugin: NSObject, FlutterPlugin, FlutterSceneLifeCycleDelegate {
    private weak var registrar: FlutterPluginRegistrar?
    private var capturedScreen: UIScreen?
    private var capturedBrightness: CGFloat?

    private init(registrar: FlutterPluginRegistrar) {
        self.registrar = registrar
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
        let instance = EnteScreenBrightnessPlugin(registrar: registrar)
        registrar.addMethodCallDelegate(instance, channel: channel)
        registrar.addSceneDelegate(instance)
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

            guard let screen = activeScreen() else {
                result(false)
                return
            }

            if let capturedScreen, capturedScreen !== screen {
                result(false)
                return
            }

            let currentBrightness = screen.brightness
            guard currentBrightness > brightness else {
                result(false)
                return
            }

            let startedSession = capturedBrightness == nil
            if startedSession {
                capturedScreen = screen
                capturedBrightness = currentBrightness
            }
            screen.brightness = brightness
            let didDim = screen.brightness < currentBrightness
            if !didDim && startedSession {
                capturedScreen = nil
                capturedBrightness = nil
            }
            result(didDim)

        case "restoreBrightness":
            restoreCapturedBrightness()
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func activeScreen() -> UIScreen? {
        guard let window = registrar?.viewController?.viewIfLoaded?.window else {
            return nil
        }
        if let scene = window.windowScene {
            return scene.activationState == .foregroundActive ? scene.screen : nil
        }
        return UIApplication.shared.applicationState == .active ? window.screen : nil
    }

    @objc private func restoreForAppDeactivation(_ notification: Notification) {
        restoreCapturedBrightness()
    }

    public func sceneWillResignActive(_ scene: UIScene) {
        restoreCapturedBrightness()
    }

    public func sceneDidDisconnect(_ scene: UIScene) {
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
