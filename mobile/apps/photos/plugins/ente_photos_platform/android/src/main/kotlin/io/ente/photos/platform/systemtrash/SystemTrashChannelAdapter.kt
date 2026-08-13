package io.ente.photos.platform.systemtrash

import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

class SystemTrashChannelAdapter(private val service: SystemTrashService) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var closed = false

    fun getFiles(result: MethodChannel.Result) {
        executor.execute {
            try {
                val files = service.getFiles().map { it.toChannelMap() }
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

    private fun SystemTrashFile.toChannelMap(): Map<String, Any> =
        mapOf(
            "localID" to localID,
            "deleteBy" to deleteBy,
            "deviceFolder" to deviceFolder,
        )
}
