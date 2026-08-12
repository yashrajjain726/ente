import 'package:flutter/services.dart';

/// Diagnostic state of a named process lock.
class ProcessLockState {
  const ProcessLockState({
    required this.origin,
    required this.operation,
    required this.heldFor,
  });

  factory ProcessLockState.fromMap(Map<dynamic, dynamic> map) {
    final origin = map['origin'];
    final operation = map['operation'];
    final heldForMillis = map['heldForMillis'];
    if (origin is! String || operation is! String || heldForMillis is! int) {
      throw const FormatException('Malformed process lock state');
    }
    return ProcessLockState(
      origin: origin,
      operation: operation,
      heldFor: Duration(milliseconds: heldForMillis),
    );
  }

  final String origin;
  final String operation;
  final Duration heldFor;

  @override
  String toString() =>
      'ProcessLockState(origin: $origin, operation: $operation, '
      'heldFor: ${heldFor.inMilliseconds}ms)';
}

/// Client for the process-global, engine-owned named locks.
///
/// At most one Flutter engine holds a given name at a time. Acquisition is
/// idempotent for the engine that already holds the name; locks are released
/// automatically when the owning engine detaches, and all state dies with
/// the OS process.
class ProcessLockClient {
  ProcessLockClient({MethodChannel? methodChannel})
    : _methodChannel = methodChannel ?? const MethodChannel(_methodChannelName);

  static final instance = ProcessLockClient();
  static const _methodChannelName = 'io.ente.photos.platform/process_lock';

  final MethodChannel _methodChannel;

  /// Attempts to acquire [name] for this engine. Returns false when another
  /// engine holds the lock. [origin] and [operation] are diagnostic labels.
  Future<bool> tryAcquire({
    required String name,
    required String origin,
    required String operation,
  }) async {
    final result = await _methodChannel.invokeMethod<bool>(
      'processLock.tryAcquire',
      {'name': name, 'origin': origin, 'operation': operation},
    );
    if (result == null) {
      throw const FormatException('processLock.tryAcquire returned no result');
    }
    return result;
  }

  /// Releases [name] if this engine holds it. Returns whether a release
  /// occurred.
  Future<bool> release({required String name}) async {
    final result = await _methodChannel.invokeMethod<bool>(
      'processLock.release',
      {'name': name},
    );
    if (result == null) {
      throw const FormatException('processLock.release returned no result');
    }
    return result;
  }

  /// Returns the current holder of [name], or null when the lock is free.
  Future<ProcessLockState?> state({required String name}) async {
    final result = await _methodChannel.invokeMethod<Map<dynamic, dynamic>>(
      'processLock.state',
      {'name': name},
    );
    if (result == null) return null;
    return ProcessLockState.fromMap(result);
  }
}
