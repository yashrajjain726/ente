import "dart:async";

import "package:ente_photos_platform/ente_photos_platform.dart";
import "package:logging/logging.dart";
import "package:synchronized/synchronized.dart";

enum MlOperation {
  fullRun,
  indexing,
  clustering,
  startupRemoteHydration,
  clipVectorMigration,
  clusterCentroidVectorMigration,
}

enum MlLockAttempt {
  ran,
  deniedFunnelBusy,
  deniedByOtherEngine,
  deniedChannelError,
}

enum MlRunDisposition { completed, denied, stopped, failed }

/// Per-engine funnel plus the process-global `ml` lock.
///
/// All top-level ML operations must run through [tryRunExclusive]: the funnel
/// serializes operations within this engine, and the native lock excludes the
/// other engine. Calls make a single attempt unless [waitForAvailability] is
/// set for maintenance work that must complete before its caller continues.
class MlProcessLock {
  MlProcessLock._();
  static final instance = MlProcessLock._();

  static const _lockName = "ml";
  static const _availabilityPollInterval = Duration(milliseconds: 500);
  final _logger = Logger("MlProcessLock");
  final Lock _funnel = Lock();
  MlOperation? _activeOperation;

  /// Whether an operation currently holds the funnel. For asserts and
  /// diagnostics only — never use this to skip [tryRunExclusive].
  bool get isBusy => _activeOperation != null;

  MlOperation? get activeOperation => _activeOperation;

  /// Runs [body] while holding the funnel and the native `ml` lock. The lock
  /// is released only after [body] completes, so [body] must drain any
  /// protected ML work it started before returning. Errors from [body]
  /// propagate after release. [background] labels this engine's origin.
  /// [waitForAvailability] waits for both the local funnel and the other
  /// engine instead of returning a busy denial.
  Future<MlLockAttempt> tryRunExclusive(
    MlOperation operation,
    Future<void> Function() body, {
    required bool background,
    bool waitForAvailability = false,
  }) async {
    if (!waitForAvailability && _funnel.locked) {
      _logger.info(
        "Funnel busy with ${_activeOperation?.name}, denying ${operation.name}",
      );
      return MlLockAttempt.deniedFunnelBusy;
    }
    return _funnel.synchronized(() async {
      _activeOperation = operation;
      try {
        final origin = background ? "bg" : "fg";
        while (true) {
          final bool acquired;
          try {
            acquired = await ProcessLockClient.instance.tryAcquire(
              name: _lockName,
              origin: origin,
              operation: operation.name,
            );
          } catch (e, s) {
            // Fail closed: no protected ML without the lock.
            _logger.severe(
              "Process lock channel failure for ${operation.name}",
              e,
              s,
            );
            return MlLockAttempt.deniedChannelError;
          }
          if (acquired) break;
          if (!waitForAvailability) {
            unawaited(_logOwner(operation));
            return MlLockAttempt.deniedByOtherEngine;
          }
          await Future<void>.delayed(_availabilityPollInterval);
        }
        _logger.info("Acquired ml lock ($origin/${operation.name})");
        final heldSince = DateTime.now();
        try {
          await body();
          return MlLockAttempt.ran;
        } finally {
          try {
            await ProcessLockClient.instance.release(name: _lockName);
            final heldFor = DateTime.now().difference(heldSince);
            _logger.info(
              "Released ml lock ($origin/${operation.name}) after "
              "${heldFor.inSeconds}s",
            );
          } catch (e, s) {
            _logger.severe(
              "Failed to release ml lock after ${operation.name}",
              e,
              s,
            );
          }
        }
      } finally {
        _activeOperation = null;
      }
    });
  }

  Future<void> _logOwner(MlOperation denied) async {
    try {
      final owner = await ProcessLockClient.instance.state(name: _lockName);
      _logger.info("ml lock denied for ${denied.name}, current owner: $owner");
    } catch (e) {
      _logger.warning("Could not fetch ml lock state after denial: $e");
    }
  }
}
