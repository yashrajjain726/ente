@preconcurrency import Flutter

@MainActor
final class CountryNamesChannelAdapter {
    private let channel: FlutterMethodChannel
    private let service = CountryNamesService()

    init(registrar: FlutterPluginRegistrar) {
        channel = FlutterMethodChannel(
            name: "io.ente.photos.platform/country_names",
            binaryMessenger: registrar.messenger()
        )
        channel.setMethodCallHandler { [service] call, result in
            guard call.method == "get" else {
                result(FlutterMethodNotImplemented)
                return
            }
            guard let locale = call.arguments as? String else {
                result(FlutterError(code: "invalid_locale", message: "Expected a locale identifier", details: nil))
                return
            }
            let names = service.names(localeIdentifier: locale)
            result(["region": names.region, "names": names.names])
        }
    }

    func detach() {
        channel.setMethodCallHandler(nil)
    }
}
