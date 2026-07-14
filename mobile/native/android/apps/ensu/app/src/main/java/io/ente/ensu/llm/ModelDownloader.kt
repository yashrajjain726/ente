package io.ente.ensu.llm

import android.content.Context
import android.os.Environment
import android.util.Log
import io.ente.ensu.bindings.LlmModelDownloadCallback
import io.ente.ensu.bindings.LlmModelDownloadProgress
import io.ente.ensu.bindings.ModelDownloader as RustModelDownloader
import io.ente.ensu.bindings.ModelTarget as RustModelTarget
import io.ente.ensu.bindings.uniffiEnsureInitialized
import io.ente.ensu.format.formatBytes
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext

class ModelDownloader(context: Context) {
    private val appContext = context.applicationContext
    private val rust: RustModelDownloader

    init {
        uniffiEnsureInitialized()
        rust = RustModelDownloader(
            File(appContext.noBackupFilesDir, "models").absolutePath,
            appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?.let { File(it, "llm").absolutePath }
        )
    }

    val isDownloadActive: Boolean get() = rust.isDownloadActive()

    fun modelPath(target: LlmModelTarget): File = File(rust.modelPath(target.toRust()))

    fun mmprojPath(target: LlmModelTarget): File? = rust.mmprojPath(target.toRust())?.let(::File)

    fun isDownloaded(target: LlmModelTarget): Boolean = rust.isDownloaded(target.toRust())

    fun cancel() = rust.cancel()

    fun migrate() {
        File(appContext.filesDir, "llm").deleteRecursively()
        rust.migrate()
    }

    suspend fun estimateDownloadSize(target: LlmModelTarget): Long? = withContext(Dispatchers.IO) {
        rust.estimatedDownloadSize(target.toRust())
    }

    suspend fun download(target: LlmModelTarget, onProgress: (DownloadProgress) -> Unit) {
        val downloadJob = coroutineContext[Job]
        val rustTarget = target.toRust()
        rust.migrate()
        if (rust.isDownloaded(rustTarget)) return

        ModelDownloadJobService.begin(appContext) { rust.cancel() }
        try {
            rust.download(
                rustTarget,
                object : LlmModelDownloadCallback {
                    override fun onProgress(progress: LlmModelDownloadProgress) {
                        logMetrics(progress)
                        ModelDownloadJobService.update(
                            appContext,
                            progress.downloadedBytes,
                            progress.totalBytes
                        )
                        onProgress(progress.toDomainProgress())
                    }

                    override fun isCancelled(): Boolean = downloadJob?.isCancelled == true
                }
            )
        } finally {
            ModelDownloadJobService.end(appContext)
        }
    }

    private fun LlmModelTarget.toRust() =
        RustModelTarget(id = id, url = url, mmprojUrl = mmprojUrl)

    private fun logMetrics(progress: LlmModelDownloadProgress) {
        if (progress.fileComplete) {
            Log.i(
                "ModelDownloader",
                "Model download file complete label=${progress.label} " +
                    "bytes=${progress.fileDownloadedBytes} " +
                    "elapsedMs=${progress.fileElapsedMs} " +
                    "rate=${formatRate(progress.fileBytesPerSecond)} " +
                    "retries=${progress.fileRetryCount}"
            )
        }
        if (progress.complete) {
            Log.i(
                "ModelDownloader",
                "Model download complete bytes=${progress.downloadedBytes} " +
                    "elapsedMs=${progress.elapsedMs} " +
                    "rate=${formatRate(progress.bytesPerSecond)} " +
                    "retries=${progress.retryCount}"
            )
        }
    }

    private fun formatRate(bytesPerSecond: Double): String {
        val bytes = if (bytesPerSecond.isFinite() && bytesPerSecond > 0.0) {
            bytesPerSecond.toLong()
        } else {
            0L
        }
        return "${formatBytes(bytes)}/s"
    }

    private fun LlmModelDownloadProgress.toDomainProgress(): DownloadProgress {
        val downloaded = downloadedBytes.coerceAtLeast(0L)
        val total = totalBytes?.takeIf { it > 0 }
        val percent = if (total != null) {
            ((downloaded * 100) / total).toInt().coerceIn(0, 99)
        } else {
            0
        }
        val status = if (total != null) {
            "Downloading... ${formatBytes(downloaded)} / ${formatBytes(total)}"
        } else if (fileDownloadedBytes > 0) {
            "Downloading ${label.lowercase()}... ${formatBytes(fileDownloadedBytes)}"
        } else {
            "Downloading ${label.lowercase()}..."
        }
        return DownloadProgress(percent, status)
    }
}
