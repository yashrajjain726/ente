import SwiftUI

@main
struct EnsuApp: App {
    init() {
        EnsuLogging.shared.start()
        if #available(iOS 26.0, *) {
            ModelDownloadBackgroundTask.register()
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
