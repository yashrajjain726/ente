package io.ente.photos.platform

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class EntePhotosPlatformPlugin :
    FlutterPlugin,
    MethodChannel.MethodCallHandler,
    EventChannel.StreamHandler {
    private lateinit var context: Context
    private lateinit var methodChannel: MethodChannel
    private lateinit var eventChannel: EventChannel
    private val mainHandler = Handler(Looper.getMainLooper())
    private var eventSink: EventChannel.EventSink? = null
    private var batteryReceiverRegistered = false
    private var thermalListenerRegistered = false
    private var snapshotPending = false
    private var lastEmittedState: Map<String, Any?>? = null

    private val batteryReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                emitSnapshot()
            }
        }

    private val thermalListener =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PowerManager.OnThermalStatusChangedListener { emitSnapshot() }
        } else {
            null
        }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        methodChannel = MethodChannel(binding.binaryMessenger, METHOD_CHANNEL)
        eventChannel = EventChannel(binding.binaryMessenger, EVENT_CHANNEL)
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "deviceHealth.getSnapshot" -> result.success(snapshot())
            "deviceHealth.getMemorySnapshot" -> result.success(memorySnapshot())
            else -> result.notImplemented()
        }
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        stopObserving()
        eventSink = events
        lastEmittedState = null
        startObserving()
        emitSnapshot()
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
        lastEmittedState = null
        stopObserving()
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        eventSink = null
        stopObserving()
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
    }

    private fun startObserving() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(
                    batteryReceiver,
                    IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                    Context.RECEIVER_NOT_EXPORTED,
                )
            } else {
                @Suppress("DEPRECATION")
                context.registerReceiver(
                    batteryReceiver,
                    IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                )
            }
            batteryReceiverRegistered = true
        } catch (_: RuntimeException) {
            batteryReceiverRegistered = false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val powerManager = context.getSystemService(PowerManager::class.java)
                val listener = thermalListener ?: return
                powerManager.addThermalStatusListener(context.mainExecutor, listener)
                thermalListenerRegistered = true
            } catch (_: RuntimeException) {
                thermalListenerRegistered = false
            }
        }
    }

    private fun stopObserving() {
        if (batteryReceiverRegistered) {
            try {
                context.unregisterReceiver(batteryReceiver)
            } catch (_: IllegalArgumentException) {
                // Already unregistered by the platform.
            }
            batteryReceiverRegistered = false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && thermalListenerRegistered) {
            try {
                val listener = thermalListener
                if (listener != null) {
                    context.getSystemService(PowerManager::class.java)
                        .removeThermalStatusListener(listener)
                }
            } catch (_: RuntimeException) {
                // Engine teardown has no remaining consumer for this listener.
            }
            thermalListenerRegistered = false
        }
    }

    private fun emitSnapshot() {
        if (eventSink == null || snapshotPending) return
        snapshotPending = true
        mainHandler.post {
            snapshotPending = false
            val sink = eventSink ?: return@post
            val snapshot = snapshot()
            val state = mapOf(
                "battery" to snapshot["battery"],
                "thermal" to snapshot["thermal"],
            )
            if (state != lastEmittedState) {
                lastEmittedState = state
                sink.success(snapshot)
            }
        }
    }

    private fun snapshot(): Map<String, Any?> =
        mapOf(
            "platform" to "android",
            "observedAtMs" to System.currentTimeMillis(),
            "battery" to batterySnapshot(),
            "thermal" to thermalSnapshot(),
        )

    private fun batterySnapshot(): Map<String, Any?> {
        return try {
            val intent = stickyBatteryIntent()
                ?: return unavailable("battery_intent_missing")
            if (!intent.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)) {
                return unavailable("battery_not_present")
            }
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level < 0 || scale <= 0 || level > scale) {
                return unavailable("battery_level_missing")
            }
            val levelPercent = ((level.toDouble() / scale) * 100).toInt()
            val temperature = intent.getIntExtra(
                BatteryManager.EXTRA_TEMPERATURE,
                Int.MIN_VALUE,
            )
            val values =
                mutableMapOf<String, Any?>(
                    "status" to "available",
                    "levelPercent" to levelPercent,
                    "health" to batteryHealth(
                        intent.getIntExtra(
                            BatteryManager.EXTRA_HEALTH,
                            BatteryManager.BATTERY_HEALTH_UNKNOWN,
                        ),
                    ),
                )
            if (temperature != Int.MIN_VALUE) {
                values["temperatureCelsius"] = temperature / 10.0
            }
            values
        } catch (_: SecurityException) {
            unavailable("battery_access_denied")
        } catch (_: RuntimeException) {
            unavailable("battery_read_failed")
        }
    }

    private fun stickyBatteryIntent(): Intent? {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(null, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(null, filter)
        }
    }

    private fun thermalSnapshot(): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return mapOf("status" to "unsupported")
        }
        return try {
            val status = context.getSystemService(PowerManager::class.java).currentThermalStatus
            val state = thermalState(status)
                ?: return unavailable("thermal_status_unknown")
            mapOf("status" to "available", "state" to state)
        } catch (_: RuntimeException) {
            unavailable("thermal_read_failed")
        }
    }

    private fun memorySnapshot(): Map<String, Any?> {
        return try {
            val info = ActivityManager.MemoryInfo()
            context.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
            if (info.totalMem <= 0) {
                unavailable("memory_total_missing")
            } else {
                mapOf("status" to "available", "totalBytes" to info.totalMem)
            }
        } catch (_: RuntimeException) {
            unavailable("memory_read_failed")
        }
    }

    private fun unavailable(errorCode: String): Map<String, Any?> =
        mapOf("status" to "unavailable", "errorCode" to errorCode)

    private fun batteryHealth(value: Int): String =
        when (value) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "good"
            BatteryManager.BATTERY_HEALTH_COLD -> "cold"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheating"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "overVoltage"
            BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
            BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
            else -> "unknown"
        }

    private fun thermalState(value: Int): String? =
        when (value) {
            PowerManager.THERMAL_STATUS_NONE -> "nominal"
            PowerManager.THERMAL_STATUS_LIGHT -> "light"
            PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
            PowerManager.THERMAL_STATUS_SEVERE -> "serious"
            PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
            PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
            else -> null
        }

    private companion object {
        private const val METHOD_CHANNEL = "io.ente.photos.platform"
        private const val EVENT_CHANNEL =
            "io.ente.photos.platform/device_health_events"
    }
}
