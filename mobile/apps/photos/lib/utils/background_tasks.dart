import "dart:async";
import "dart:convert";
import "dart:io";

import "package:computer/computer.dart";
import "package:ente_background_manager/ente_background_manager.dart";
import "package:ente_photos_platform/ente_photos_platform.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/foundation.dart";
import "package:flutter/widgets.dart" show AppLifecycleState, WidgetsBinding;
import "package:logging/logging.dart";
import "package:permission_handler/permission_handler.dart";
import "package:photos/db/upload_locks_db.dart";
import "package:photos/main.dart";
import "package:photos/module/upload/service/file_uploader.dart";
import "package:photos/services/machine_learning/ml_run_control.dart";
import "package:photos/utils/bg_task_utils.dart";
import "package:shared_preferences/shared_preferences.dart";
import "package:workmanager/workmanager.dart" as legacy;

@pragma("vm:entry-point")
void nativeBackgroundDispatcher() {
  unawaited(BackgroundManager.executeTask(BackgroundTasks.execute));
}

class BackgroundTasks {
  static final _logger = Logger("BackgroundTasks");
  static const refresh = "io.ente.photos.nativeBackgroundRefresh";
  static const processing = "io.ente.photos.nativeBackgroundProcessing";
  static const _pipelineHandoffWait = Duration(seconds: 5);
  static Future<void> _configuration = Future.value();
  static bool? _configuredNative;

  static Future<void> configure() {
    final next = _configuration.then((_) => _configure());
    _configuration = next.catchError((Object error, StackTrace stack) {
      _logger.warning("Background configuration failed", error, stack);
    });
    return next;
  }

  static Future<void> _configure() async {
    final useNative = await nativeEnabled(
      await SharedPreferences.getInstance(),
    );
    var shouldRetireLegacySchedules = false;
    try {
      if (!useNative) {
        if (_configuredNative != false) {
          try {
            await _configureNative(enabled: false);
          } catch (error, stack) {
            _logger.warning(
              "Failed to disable native scheduling",
              error,
              stack,
            );
          }
          await BgTaskUtils.configureWorkmanager();
          _configuredNative = false;
        } else if (Platform.isIOS) {
          await BgTaskUtils.ensureIOSProcessingTaskScheduled();
        }
      } else {
        if (Platform.isIOS) await retireLegacySchedules();
        await _configureNative(enabled: true);
        _configuredNative = true;
        shouldRetireLegacySchedules = Platform.isAndroid;
      }
    } finally {
      if (!isProcessBg &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        await BackgroundManager.stopActiveRun();
        final acquired = await ProcessLockClient.instance.tryAcquire(
          name: "background_process",
          origin: "fg",
          operation: "backgroundRecovery",
        );
        if (acquired) {
          try {
            await UploadLocksDB.instance.releaseLocksAcquiredByOwnerBefore(
              ProcessType.background.toString(),
              DateTime.now().microsecondsSinceEpoch,
            );
            if (shouldRetireLegacySchedules) await retireLegacySchedules();
          } finally {
            await ProcessLockClient.instance.release(
              name: "background_process",
            );
          }
        }
      }
    }
  }

  static Future<void> _configureNative({required bool enabled}) async {
    final allowRefresh =
        enabled &&
        (!Platform.isIOS || await Permission.backgroundRefresh.isGranted);
    await BackgroundManager.configure(
      dispatcher: nativeBackgroundDispatcher,
      tasks: enabled
          ? [
              if (allowRefresh)
                BackgroundTaskConfig(
                  identifier: refresh,
                  kind: BackgroundTaskKind.refresh,
                  frequency: Duration(minutes: Platform.isIOS ? 30 : 15),
                  initialDelay: kDebugMode
                      ? Duration.zero
                      : const Duration(minutes: 10),
                  requiresNetwork: Platform.isAndroid,
                  runBudget: Platform.isIOS
                      ? BgTaskUtils.taskTimeoutFor(
                          BgTaskUtils.iOSBackgroundAppRefreshTask,
                        )
                      : BgTaskUtils.mlSelfStopFor(
                          BgTaskUtils.androidPeriodicTask,
                        ),
                ),
              BackgroundTaskConfig(
                identifier: processing,
                kind: BackgroundTaskKind.processing,
                frequency: Platform.isIOS
                    ? const Duration(minutes: 30)
                    : const Duration(hours: 2),
                initialDelay: Platform.isIOS && !kDebugMode
                    ? const Duration(minutes: 30)
                    : Duration.zero,
                flexInterval: Platform.isAndroid
                    ? const Duration(hours: 2)
                    : null,
                requiresNetwork: true,
                requiresCharging: true,
                requiresDeviceIdle: Platform.isAndroid,
                runBudget: Platform.isIOS
                    ? BgTaskUtils.taskTimeoutFor(
                        BgTaskUtils.iOSBackgroundProcessingTask,
                      )
                    : BgTaskUtils.mlSelfStopFor(
                        BgTaskUtils.androidBackgroundProcessingTask,
                      ),
              ),
            ]
          : [],
      enabled: enabled,
      onOutcome: (outcome) {
        _logger.info(
          "${outcome.identifier}: ${outcome.outcome.name}"
          "${outcome.reason == null ? '' : ' (${outcome.reason})'}"
          "${outcome.error == null ? '' : ': ${outcome.error}'}",
        );
      },
    );
  }

  static Future<bool> nativeEnabled(SharedPreferences prefs) async {
    await prefs.reload();
    if (prefs.getBool("ls.internal_user_disabled") == true) {
      return false;
    }
    if (kDebugMode) return true;
    try {
      final flags = jsonDecode(prefs.getString("remote_flags") ?? "{}");
      return flags is Map && flags["internalUser"] == true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> _acquirePipeline(BackgroundTask task) async {
    final wait = task.identifier == processing
        ? _pipelineHandoffWait
        : Duration.zero;
    final waited = Stopwatch()..start();
    while (true) {
      if (await ProcessLockClient.instance.tryAcquire(
        name: "background_process",
        origin: "bg",
        operation: task.identifier,
      )) {
        return true;
      }
      if (task.isStopping || waited.elapsed >= wait) return false;
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
  }

  static Future<void> retireLegacySchedules() async {
    BgTaskUtils.resetProcessingSchedule();
    final identifiers = Platform.isIOS
        ? [
            BgTaskUtils.iOSBackgroundAppRefreshTask,
            BgTaskUtils.iOSBackgroundProcessingTask,
          ]
        : [
            BgTaskUtils.androidPeriodicTask,
            BgTaskUtils.androidBackgroundProcessingTask,
          ];
    for (final identifier in identifiers) {
      await legacy.Workmanager().cancelByUniqueName(identifier);
    }
  }

  static Future<BackgroundTaskResult> execute(BackgroundTask task) async {
    var result = BackgroundTaskResult.stopped;
    await runWithLogs(
      () async {
        try {
          _logger.info("${task.identifier}: task started");
          final prefs = await SharedPreferences.getInstance();
          if (!await nativeEnabled(prefs)) {
            _logger.info(
              "${task.identifier}: skipped, native backend disabled",
            );
            result = BackgroundTaskResult.skipped;
            return;
          }
          task.throwIfStopping();
          if (!await _acquirePipeline(task)) {
            _logger.info(
              "${task.identifier}: skipped, background pipeline busy",
            );
            result = BackgroundTaskResult.skipped;
            return;
          }
          task.throwIfStopping();
          await retireLegacySchedules();
          final taskName = task.identifier == processing
              ? (Platform.isIOS
                    ? BgTaskUtils.iOSBackgroundProcessingTask
                    : BgTaskUtils.androidBackgroundProcessingTask)
              : (Platform.isIOS
                    ? BgTaskUtils.iOSBackgroundAppRefreshTask
                    : BgTaskUtils.androidPeriodicTask);
          final control = MlRunControl();
          unawaited(
            task.stopped.then((reason) {
              control.requestStop(
                reason == BackgroundStopReason.foreground
                    ? MlStopReason.foregroundActive
                    : MlStopReason.backgroundDeadline,
              );
              if (reason == BackgroundStopReason.preempted) {
                stopBackgroundSync();
              }
            }),
          );
          try {
            final remainingBudget =
                BgTaskUtils.taskTimeoutFor(taskName) - task.elapsed;
            await runBackgroundTask(
              taskName,
              TimeLogger(),
              control: control,
              shouldYield: () =>
                  task.stopReason == BackgroundStopReason.preempted,
              mlSelfStop: BgTaskUtils.mlSelfStopFor(taskName) - task.elapsed,
              mlLockWait: BgTaskUtils.mlLockWaitFor(taskName),
            ).timeout(
              remainingBudget.isNegative ? Duration.zero : remainingBudget,
              onTimeout: () async {
                await BgTaskUtils.releaseResourcesForKill(taskName, prefs);
                throw TimeoutException("Background task timed out");
              },
            );
            result = task.isStopping
                ? BackgroundTaskResult.stopped
                : BackgroundTaskResult.completed;
          } finally {
            await Computer.shared().turnOff();
          }
        } on BackgroundTaskStopped {
          result = BackgroundTaskResult.stopped;
        } catch (error, stack) {
          _logger.warning("${task.identifier}: task failed", error, stack);
          result = BackgroundTaskResult.failed;
        }
        _logger.info("${task.identifier}: task ${result.name}");
      },
      prefix: "[bg]",
      sentryInitTimeout: const Duration(seconds: 5),
    );
    return result;
  }
}
