package io.ente.ensu.llm

import android.content.Context
import android.os.Environment
import android.util.Log
import io.ente.ensu.bindings.ModelDownloadCallback
import io.ente.ensu.bindings.ModelDownloadCore
import io.ente.ensu.bindings.ModelDownloadProgress
import io.ente.ensu.bindings.ModelDownloadTarget
import io.ente.ensu.bindings.migrateLegacyDir
import io.ente.ensu.bindings.uniffiEnsureInitialized
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext

class ModelDownloader(context: Context) {
    private val appContext = context.applicationContext
    private val modelsDir = File(appContext.noBackupFilesDir, "models")
    private val legacyDir = appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        ?.let { File(it, "llm") }
    private val core: ModelDownloadCore

    init {
        uniffiEnsureInitialized()
        ModelDownloadJobService.attach(appContext)
        core = ModelDownloadCore(modelsDir.absolutePath)
    }

    fun needsMigration(): Boolean = legacyDir?.exists() == true

    fun migrate(targets: List<ModelDownloadTarget>) {
        File(appContext.filesDir, "llm").deleteRecursively()
        legacyDir?.let { migrateLegacyDir(modelsDir.absolutePath, it.absolutePath, targets) }
    }

    val isDownloadActive: Boolean get() = core.isDownloadActive()

    fun modelPath(target: ModelDownloadTarget): File = File(core.modelPath(target))

    fun mmprojPath(target: ModelDownloadTarget): String? = core.mmprojPath(target)

    fun isDownloaded(target: ModelDownloadTarget): Boolean = core.isDownloaded(target)

    fun removeDownloaded(target: ModelDownloadTarget): Boolean = core.removeDownloaded(target)

    fun cancel() = core.cancel()

    suspend fun estimateDownloadSize(target: ModelDownloadTarget): Long? = withContext(Dispatchers.IO) {
        core.estimatedDownloadSize(target)
    }

    suspend fun download(target: ModelDownloadTarget, onProgress: (DownloadProgress) -> Unit): Boolean {
        val downloadJob = coroutineContext[Job]
        if (core.isDownloaded(target)) return false

        ModelDownloadJobService.begin { core.cancel() }
        return try {
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
