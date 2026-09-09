import "dart:async";
import "dart:io";

import "package:ente_photos_platform/ente_photos_platform.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/foundation.dart";
import "package:flutter/widgets.dart" show AppLifecycleState, WidgetsBinding;
import "package:logging/logging.dart";
import "package:permission_handler/permission_handler.dart";
import "package:photos/db/upload_locks_db.dart";
import "package:photos/main.dart";
import "package:photos/module/upload/service/file_uploader.dart";
import "package:photos/services/process_activity.dart";
import "package:shared_preferences/shared_preferences.dart";
import "package:workmanager/workmanager.dart" as workmanager;

@pragma('vm:entry-point')
void callbackDispatcher() {
  workmanager.Workmanager().executeTask((taskName, inputData) async {
    final Stopwatch taskStopwatch = Stopwatch()..start();
    final TimeLogger tlog = TimeLogger();
    // Deferred error construction: an eagerly created Future.error with no
    // listener surfaces as an unhandled exception even on success.
    String? failure = "Task didn't run";
    bool timedOut = false;
    bool ownsPipeline = !Platform.isIOS;
    final isIOSProcessingTask =
        Platform.isIOS && taskName == BgTaskUtils.iOSBackgroundProcessingTask;
    final prefs = await SharedPreferences.getInstance();

    await runWithLogs(
      () async {
        try {
          BgTaskUtils.$.info('Task started $tlog');
          if (isIOSProcessingTask) {
            await BgTaskUtils.scheduleIOSBackgroundProcessingTask();
          }
          if (Platform.isIOS) {
            ownsPipeline = await BgTaskUtils.acquireIOSBackgroundPipeline(
              taskName,
              taskStopwatch,
            );
            if (!ownsPipeline) {
              BgTaskUtils.$.info(
                'Skipping $taskName, background pipeline busy',
              );
              failure = null;
              return;
            }
          }
          if (isIOSProcessingTask) {
            await BgTaskUtils.markProcessingTaskStart(prefs);
          }
          final Duration taskBudget = BgTaskUtils.taskTimeoutFor(taskName);
          final Duration remainingBudget = Platform.isIOS
              ? taskBudget - taskStopwatch.elapsed
              : taskBudget;
          final mlSelfStop = BgTaskUtils.mlSelfStopFor(taskName);
          await runBackgroundTask(
            taskName,
            tlog,
            mlSelfStop: Platform.isIOS
                ? mlSelfStop - taskStopwatch.elapsed
                : mlSelfStop,
            mlLockWait: BgTaskUtils.mlLockWaitFor(taskName),
          ).timeout(
            remainingBudget.isNegative ? Duration.zero : remainingBudget,
            onTimeout: () async {
              timedOut = true;
              BgTaskUtils.$.warning(
                "TLE, committing seppuku for taskID: $taskName",
              );
              await BgTaskUtils.releaseResourcesForKill(taskName, prefs);
            },
          );
          if (timedOut) {
            failure = "Task timed out";
          } else {
            BgTaskUtils.$.info('Task run successful $tlog');
            failure = null;
          }
        } catch (e) {
          BgTaskUtils.$.warning('Task error: $e');
          if (ownsPipeline) {
            await BgTaskUtils.releaseResourcesForKill(taskName, prefs);
          }
          failure = e.toString();
        } finally {
          // A timed-out run may still be draining, so its marker stays set.
          if (ownsPipeline && !timedOut && isIOSProcessingTask) {
            await BgTaskUtils.clearProcessingTaskStart(prefs);
          }
        }
      },
      prefix: "[bg]",
      sentryInitTimeout: const Duration(seconds: 5),
    ).onError((_, _) {
      failure = "Didn't finished correctly!";
      return;
    });

    final error = failure;
    if (error != null) {
      return Future.error(error);
    }
    return true;
  });
}

class BgTaskUtils {
  static final $ = Logger("BgTaskUtils");

  static const iOSBackgroundAppRefreshTask =
      "io.ente.frame.iOSBackgroundAppRefresh";
  static const iOSBackgroundProcessingTask =
      "io.ente.frame.iOSBackgroundProcessing";
  static const androidPeriodicTask = "io.ente.photos.androidPeriodicTask";

  static Future<bool> acquireIOSBackgroundPipeline(
    String taskName,
    Stopwatch taskStopwatch,
  ) async {
    final waitDeadline =
        taskStopwatch.elapsed +
        (taskName == iOSBackgroundProcessingTask
            ? const Duration(seconds: 30)
            : Duration.zero);
    final taskBudget = taskTimeoutFor(taskName);
    const pollInterval = Duration(milliseconds: 500);
    do {
      if (taskStopwatch.elapsed >= taskBudget) return false;
      if (await ProcessLockClient.instance.tryAcquire(
        name: "background_process",
        origin: "bg",
        operation: taskName,
      )) {
        $.info(
          'Acquired background pipeline for $taskName until engine detach',
        );
        return true;
      }
      final remainingWait = waitDeadline - taskStopwatch.elapsed;
      if (remainingWait <= Duration.zero) return false;
      await Future<void>.delayed(
        remainingWait < pollInterval ? remainingWait : pollInterval,
      );
    } while (taskStopwatch.elapsed < waitDeadline);
    return false;
  }

  static Duration taskTimeoutFor(String taskName) {
    if (!Platform.isIOS) return const Duration(hours: 1);
    return taskName == iOSBackgroundProcessingTask
        ? kBGProcessingTaskTimeout
        : kBGTaskTimeout;
  }

  static Duration mlSelfStopFor(String taskName) {
    if (!Platform.isIOS) return kBGTaskMLSelfStopAndroid;
    return taskName == iOSBackgroundProcessingTask
        ? kBGProcessingTaskMLSelfStopIOS
        : kBGTaskMLSelfStopIOS;
  }

  static Duration? mlLockWaitFor(String taskName) {
    if (!Platform.isIOS || taskName != iOSBackgroundProcessingTask) return null;
    return kBGProcessingTaskMLLockWaitIOS;
  }

  static const _kProcessingTaskStartTimeKey = "ios_processing_task_start_time";

  static Future<void> markProcessingTaskStart(SharedPreferences prefs) async {
    final previousStart = prefs.getInt(_kProcessingTaskStartTimeKey);
    if (previousStart != null) {
      _logUncleanProcessingTaskExit(previousStart);
    }
    await prefs.setInt(
      _kProcessingTaskStartTimeKey,
      DateTime.now().microsecondsSinceEpoch,
    );
    $.info("Marked processing task start");
  }

  static Future<void> clearProcessingTaskStart(SharedPreferences prefs) async {
    await prefs.remove(_kProcessingTaskStartTimeKey);
    $.info("Cleared processing task start marker");
  }

  static Future<void> reportUncleanProcessingTaskExit() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final previousStart = prefs.getInt(_kProcessingTaskStartTimeKey);
    if (previousStart == null) return;
    if (await isBackgroundEngineActive()) return;
    _logUncleanProcessingTaskExit(previousStart);
    await prefs.remove(_kProcessingTaskStartTimeKey);
  }

  static void _logUncleanProcessingTaskExit(int startTimeMicroseconds) {
    $.warning(
      "Previous background processing task (started "
      "${DateTime.fromMicrosecondsSinceEpoch(startTimeMicroseconds)}) did not "
      "finish cleanly; it timed out while draining or the process was killed "
      "on OS expiration",
    );
  }

  static Future<void> releaseResourcesForKill(
    String taskId,
    SharedPreferences prefs,
  ) async {
    await UploadLocksDB.instance.releaseLocksAcquiredByOwnerBefore(
      ProcessType.background.toString(),
      DateTime.now().microsecondsSinceEpoch,
    );
    await prefs.remove(kLastBGTaskHeartBeatTime);
  }

  static Future configureWorkmanager() async {
    try {
      await workmanager.Workmanager().initialize(callbackDispatcher);
      if (Platform.isIOS) {
        await reportUncleanProcessingTaskExit();
        // Background refresh permission does not reliably gate processing tasks.
        final isForegroundLaunch =
            WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
        if (isForegroundLaunch) {
          await ensureIOSProcessingTaskScheduled();
        }
        final status = await Permission.backgroundRefresh.status;
        if (status != PermissionStatus.granted) {
          $.warning(
            "Background refresh permission is not granted. Please grant it to start the background app refresh task.",
          );
          return;
        }
      }
      $.warning("Configuring Work Manager for background tasks");
      final backgroundTaskIdentifier = Platform.isIOS
          ? iOSBackgroundAppRefreshTask
          : androidPeriodicTask;
      await workmanager.Workmanager().registerPeriodicTask(
        backgroundTaskIdentifier,
        backgroundTaskIdentifier,
        frequency: Platform.isIOS
            ? const Duration(minutes: 30)
            : const Duration(minutes: 15),
        initialDelay: kDebugMode ? Duration.zero : const Duration(minutes: 10),
        constraints: workmanager.Constraints(
          networkType: workmanager.NetworkType.connected,
          requiresCharging: false,
          requiresStorageNotLow: false,
          requiresDeviceIdle: false,
        ),
        existingWorkPolicy: workmanager.ExistingPeriodicWorkPolicy.update,
        backoffPolicy: workmanager.BackoffPolicy.linear,
        backoffPolicyDelay: const Duration(minutes: 15),
      );
      $.info("WorkManager configured");

      if (Platform.isAndroid) {
        final isScheduled = await workmanager.Workmanager()
            .isScheduledByUniqueName(backgroundTaskIdentifier);
        if (!isScheduled) {
          $.warning(
            "Background task is not scheduled: $backgroundTaskIdentifier",
          );
        }
      }
    } catch (e) {
      $.warning("Failed to configure WorkManager: $e");
    }
  }

  static bool _processingTaskArmedThisProcess = false;

  // Foreground arm to restart the chain after a first install or force-quit;
  // once per process, so resumes don't keep pushing the pending request out.
  static Future<void> ensureIOSProcessingTaskScheduled() async {
    if (_processingTaskArmedThisProcess) return;
    _processingTaskArmedThisProcess =
        await scheduleIOSBackgroundProcessingTask();
  }

  // Workmanager does not resubmit one-shot processing tasks.
  static Future<bool> scheduleIOSBackgroundProcessingTask() async {
    try {
      await workmanager.Workmanager().registerProcessingTask(
        iOSBackgroundProcessingTask,
        iOSBackgroundProcessingTask,
        initialDelay: kDebugMode ? Duration.zero : const Duration(minutes: 30),
        constraints: workmanager.Constraints(
          networkType: workmanager.NetworkType.connected,
          requiresCharging: true,
        ),
      );
      $.info("Scheduled iOS background processing task");
      return true;
    } catch (e) {
      $.warning("Failed to schedule iOS background processing task: $e");
      return false;
    }
  }
}
