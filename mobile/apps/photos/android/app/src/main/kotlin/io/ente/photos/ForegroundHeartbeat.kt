package io.ente.photos

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper

class ForegroundHeartbeat(private val context: Context) {
    private val handler = Handler(Looper.getMainLooper())
    private val preferences by lazy {
        context.getSharedPreferences(
            EnteApplication.FLUTTER_SHARED_PREFERENCES,
            Context.MODE_PRIVATE
        )
    }
    private var nativeHeartbeatStartedAt = 0L
    private var isRunning = false
    private var dartHasTakenOver = false
    private val heartbeat =
        object : Runnable {
            override fun run() {
                if (!isRunning) {
                    return
                }
                if (hasDartHeartbeatTakenOver()) {
                    isRunning = false
                    dartHasTakenOver = true
                    return
                }
                writeNativeHeartbeat()
                handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }

    fun start() {
        if (isRunning || dartHasTakenOver) {
            return
        }
        isRunning = true
        nativeHeartbeatStartedAt = currentTimeInMicroseconds()
        writeNativeHeartbeat(nativeHeartbeatStartedAt)
        handler.postDelayed(heartbeat, HEARTBEAT_INTERVAL_MS)
    }

    fun stop() {
        isRunning = false
        dartHasTakenOver = false
        handler.removeCallbacks(heartbeat)
    }

    private fun hasDartHeartbeatTakenOver(): Boolean {
        val dartHeartbeat =
            preferences.getLong(DART_FOREGROUND_HEARTBEAT_KEY, 0L)
        return dartHeartbeat >= nativeHeartbeatStartedAt
    }

    private fun writeNativeHeartbeat(heartbeat: Long = currentTimeInMicroseconds()) {
        preferences.edit()
            .putLong(NATIVE_FOREGROUND_HEARTBEAT_KEY, heartbeat)
            .apply()
    }

    private fun currentTimeInMicroseconds() = System.currentTimeMillis() * 1000L

    companion object {
        private const val DART_FOREGROUND_HEARTBEAT_KEY = "flutter.fg_task_hb_time"
        private const val NATIVE_FOREGROUND_HEARTBEAT_KEY = "flutter.native_fg_task_hb_time"
        private const val HEARTBEAT_INTERVAL_MS = 1000L

        fun install(application: Application) {
            val heartbeat = ForegroundHeartbeat(application)
            application.registerActivityLifecycleCallbacks(
                object : Application.ActivityLifecycleCallbacks {
                    private var startedActivities = 0

                    override fun onActivityPreCreated(
                        activity: Activity,
                        savedInstanceState: Bundle?
                    ) {
                        heartbeat.start()
                    }

                    override fun onActivityCreated(
                        activity: Activity,
                        savedInstanceState: Bundle?
                    ) {
                        heartbeat.start()
                    }

                    override fun onActivityStarted(activity: Activity) {
                        startedActivities++
                        heartbeat.start()
                    }

                    override fun onActivityResumed(activity: Activity) {}

                    override fun onActivityPaused(activity: Activity) {}

                    override fun onActivityStopped(activity: Activity) {
                        startedActivities--
                        if (startedActivities == 0) {
                            heartbeat.stop()
                        }
                    }

                    override fun onActivitySaveInstanceState(
                        activity: Activity,
                        outState: Bundle
                    ) {}

                    override fun onActivityDestroyed(activity: Activity) {
                        if (startedActivities == 0) {
                            heartbeat.stop()
                        }
                    }
                }
            )
        }
    }
}
