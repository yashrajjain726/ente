import OSLog
import SwiftUI

@main
struct CastApp: App {
    init() {
        initRustLogging(sink: CastRustLogSink())
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

private final class CastRustLogSink: RustLogSink, @unchecked Sendable {
    private let logger = Logger(subsystem: "io.ente.cast", category: "Rust")

    func log(level: RustLogLevel, target: String, message: String) {
        switch level {
        case .error:
            logger.error("[\(target)] \(message)")
        case .warn:
            logger.warning("[\(target)] \(message)")
        case .info:
            logger.info("[\(target)] \(message)")
        }
    }
}
