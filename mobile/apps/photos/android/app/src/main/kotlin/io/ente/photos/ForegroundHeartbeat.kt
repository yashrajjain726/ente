package io.ente.photos

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterFragmentActivity

abstract class ForegroundHeartbeatActivity : FlutterFragmentActivity() {
    private val foregroundHeartbeat = ForegroundHeartbeat(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        foregroundHeartbeat.start()
        super.onCreate(savedInstanceState)
    }

    override fun onStart() {
        super.onStart()
        foregroundHeartbeat.start()
    }

    override fun onStop() {
        foregroundHeartbeat.stop()
        super.onStop()
    }

    override fun onDestroy() {
        foregroundHeartbeat.stop()
        super.onDestroy()
    }
}

private class ForegroundHeartbeat(private val context: Context) {
    private val handler = Handler(Looper.getMainLooper())
    private val preferences by lazy {
        context.getSharedPreferences(
            EnteApplication.FLUTTER_SHARED_PREFERENCES,
            Context.MODE_PRIVATE
        )
    }
    private var nativeHeartbeatStartedAt = 0L
    private var isRunning = false
    private val heartbeat =
        object : Runnable {
            override fun run() {
                if (!isRunning) {
                    return
                }
                if (hasDartHeartbeatTakenOver()) {
                    isRunning = false
                    return
                }
                writeNativeHeartbeat()
                handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }

    fun start() {
        if (isRunning) {
            return
        }
        isRunning = true
        nativeHeartbeatStartedAt = currentTimeInMicroseconds()
        writeNativeHeartbeat(nativeHeartbeatStartedAt)
        handler.postDelayed(heartbeat, HEARTBEAT_INTERVAL_MS)
    }

    fun stop() {
        isRunning = false
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

    private companion object {
        const val DART_FOREGROUND_HEARTBEAT_KEY = "flutter.fg_task_hb_time"
        const val NATIVE_FOREGROUND_HEARTBEAT_KEY = "flutter.native_fg_task_hb_time"
        const val HEARTBEAT_INTERVAL_MS = 1000L
    }
}
