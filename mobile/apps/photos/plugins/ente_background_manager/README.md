# Ente background manager

A Flutter plugin for native background scheduling and headless task execution. Android uses Jetpack WorkManager; iOS uses Background Tasks. The consumer owns task logic, credentials, progress, domain locks, and cleanup.

## Integration status

The package is part of the mobile workspace. Photos does not depend on or initialize it yet; app integration is a separate change.

## Consumer interface

- `BackgroundManager.configure` supplies a retained top-level dispatcher, task configurations, scheduling enablement, and an outcome handler. Repeated configuration reconciles persistent schedules.
- `BackgroundManager.executeTask` runs the callback inside the dispatcher and handles readiness, stop delivery, errors, and completion.
- `BackgroundTask` exposes its identifier, elapsed time, optional remaining budget, and a latched stop signal. The callback stops admitting work, drains cleanup, and returns a `BackgroundTaskResult`.
- `BackgroundManager.stopActiveRun` requests stopping of the current invocation and completes after retirement. It preserves future registrations and is an immediate no-op when idle. Use it from the foreground; a background callback should return after cleanup instead of awaiting its own retirement.
- `BackgroundManager.scheduledTasks` queries native registrations. A pending registration is not a guarantee that the OS will run it.

Task configuration supports refresh/processing kind, frequency, initial delay, supported native constraints, and two optional durations. `runBudget` requests cooperative stopping from native entry, including engine startup. `foregroundStopTimeout` starts force teardown after the first foreground arrival. Omission disables the corresponding timer; zero acts immediately and negative durations are rejected. Android supports periodic flex and device-idle constraints. iOS supports network/power constraints only for processing tasks; unsupported combinations are rejected.

Before supplying `foregroundStopTimeout`, validate the lifetime of the consumer's native/FFI operations. Destroying a Flutter engine does not establish that those operations have stopped.

## Native lifecycle

Each platform has one process-local runtime. Admission checks backend eligibility, the active execution slot, and native foreground visibility before creating an engine. Busy or foreground deliveries finish as skips. Every admitted run captures its configuration and dispatcher binding and creates a fresh engine.

The slot remains occupied during startup, execution, cleanup, and teardown. Native callbacks and timers are tied to a unique invocation. Foreground entry always requests stopping, including during startup. Stops remain latched; repeated visibility changes cannot revive a task or extend its grace. Configuration updates affect later runs only.

Normal completion, startup failure, system interruption, and configured forced teardown share one retirement path. Retirement invalidates timers, detaches the task channel, destroys the background engine, and completes the native invocation once. iOS re-arms normal future opportunities independently of Dart. No plugin retry loop, work queue, engine pool, or persistent event history is used.

Consumers log their task activity. Skips, stops, forced teardown, and failures are forwarded to an available outcome handler; otherwise the plugin writes one native log line (`EnteBackgroundManager` on Android, `io.ente.background` on iOS).

## Native installation

The plugin requires Android API 26 or later and iOS 15.1 or later. iOS uses CocoaPods integration.

On Android, call `BackgroundManagerPlugin.install` from the host application's `onCreate`, supplying the application and an eligibility callback. Call `BackgroundManagerPlugin.onForeground` before `super.onCreate` in the foreground activity so an existing background run receives the stop signal before foreground engine creation. The plugin also observes activity lifecycle callbacks.

On iOS, call `BackgroundManagerPlugin.install` in `AppDelegate` with an eligibility callback and the generated plugin registrant. Register each task identifier with `BackgroundManagerPlugin.registerTask` before launch completes, declare the identifiers in `BGTaskSchedulerPermittedIdentifiers`, and enable the corresponding background modes.

## Validation

The Android test runs the real worker, scheduler configuration, method-channel encoding, and lifecycle/timer logic with mocked Flutter engines. It covers foreground and busy admission, ownership during teardown, startup stops, cooperative completion, foreground grace, configuration changes during a run, stale events, bootstrap failure, and preservation of recurring scheduling after active-run stopping.

Use a temporary Flutter host with a path dependency on this package to run native checks. Match Photos' Android build-tool versions and set the host's minimum SDK to 26. From its `android` directory:

```sh
./gradlew :ente_background_manager:testDebugUnitTest :ente_background_manager:lintDebug
```

Once the consumer is integrated, device checks remain necessary for OS-delivered refresh/processing opportunities, cold launch, system expiration, foreground handoff during real work, and release-mode callback retention.
