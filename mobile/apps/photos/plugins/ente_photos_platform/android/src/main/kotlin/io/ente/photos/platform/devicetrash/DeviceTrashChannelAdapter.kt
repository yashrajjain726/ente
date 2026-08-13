package io.ente.photos.platform.devicetrash

import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

class DeviceTrashChannelAdapter(private val service: DeviceTrashService) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var closed = false

    fun getFiles(result: MethodChannel.Result) {
        executor.execute {
            try {
                val files = service.getFiles().map { it.toChannelTuple() }
                mainHandler.post {
                    if (!closed) result.success(files)
                }
            } catch (error: Exception) {
                mainHandler.post {
                    if (!closed) {
                        result.error(
                            "media_store_query_failed",
                            error.message,
                            null,
                        )
                    }
                }
            }
        }
    }

    fun close() {
        closed = true
        mainHandler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
    }

    private fun DeviceTrashFile.toChannelTuple(): List<Any> =
        listOf(localID, deleteBy, deviceFolder)
}
