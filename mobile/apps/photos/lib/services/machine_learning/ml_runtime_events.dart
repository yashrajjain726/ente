import "package:photos/utils/isolate/isolate_operations.dart";
import "package:photos/utils/isolate/super_isolate.dart";

/// Surfaces notable Rust ML runtime events (execution provider fallbacks,
/// golden self-test failures) in the app logs.
///
/// The Rust runtime degrades gracefully without failing the calling
/// operation, so these events are the only signal that a device is running
/// ML in a degraded or misbehaving configuration.
extension MlRuntimeEventLogging on SuperIsolate {
  /// Drains the Rust runtime's process-wide event buffer and logs each event
  /// at its severity. Call after ML operations; best-effort.
  Future<void> logRustMlRuntimeEvents() async {
    try {
      final result = await runInIsolate(
        IsolateOperation.takeMlRuntimeEvents,
        {},
      );
      for (final event in (result as List?) ?? const []) {
        final map = event as Map;
        final message = "Rust ML runtime: ${map["message"]}";
        switch (map["severity"]) {
          case "severe":
            logger.severe(message);
          case "warning":
            logger.warning(message);
          default:
            logger.info(message);
        }
      }
    } catch (e, s) {
      logger.warning("Failed to take Rust ML runtime events", e, s);
    }
  }
}
