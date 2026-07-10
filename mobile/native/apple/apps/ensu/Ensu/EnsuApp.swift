import SwiftUI

@main
struct EnsuApp: App {
    @UIApplicationDelegateAdaptor(EnsuAppDelegate.self) private var appDelegate

    init() {
        EnsuLogging.shared.start()
        LegacyDataCleanup.run()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
