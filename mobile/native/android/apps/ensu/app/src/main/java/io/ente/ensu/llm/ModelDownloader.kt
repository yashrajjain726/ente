package io.ente.ensu.llm

import android.content.Context
import android.os.Environment
import android.util.Log
import io.ente.ensu.bindings.ModelDownloadCallback
import io.ente.ensu.bindings.ModelDownloadProgress
import io.ente.ensu.bindings.ModelDownloadCore
import io.ente.ensu.bindings.ModelDownloadTarget
import io.ente.ensu.bindings.uniffiEnsureInitialized
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext

class ModelDownloader(context: Context) {
    private val appContext = context.applicationContext
    private val core: ModelDownloadCore

    init {
        uniffiEnsureInitialized()
        ModelDownloadJobService.attach(appContext)
        core = ModelDownloadCore(
            File(appContext.noBackupFilesDir, "models").absolutePath,
            appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?.let { File(it, "llm").absolutePath }
        )
    }

    val isDownloadActive: Boolean get() = core.isDownloadActive()

    fun modelPath(target: ModelDownloadTarget): File = File(core.modelPath(target))

    fun mmprojPath(target: ModelDownloadTarget): String? = core.mmprojPath(target)

    fun isDownloaded(target: ModelDownloadTarget): Boolean = core.isDownloaded(target)

    fun cancel() = core.cancel()

    fun migrate() {
        File(appContext.filesDir, "llm").deleteRecursively()
        core.migrate()
    }

    suspend fun estimateDownloadSize(target: ModelDownloadTarget): Long? = withContext(Dispatchers.IO) {
        core.estimatedDownloadSize(target)
    }

    suspend fun download(target: ModelDownloadTarget, onProgress: (DownloadProgress) -> Unit) {
        val downloadJob = coroutineContext[Job]
        core.migrate()
        if (core.isDownloaded(target)) return

        ModelDownloadJobService.begin { core.cancel() }
        try {
            core.download(
                target,
                object : ModelDownloadCallback {
                    override fun onProgress(progress: ModelDownloadProgress) {
                        progress.logLine?.let { Log.i("ModelDownloader", it) }
                        ModelDownloadJobService.update(progress.percent, progress.totalBytes == null)
                        onProgress(DownloadProgress(progress.percent, progress.status))
                    }

                    override fun isCancelled(): Boolean = downloadJob?.isCancelled == true
                }
            )
        } finally {
            ModelDownloadJobService.end()
        }
    }
}
