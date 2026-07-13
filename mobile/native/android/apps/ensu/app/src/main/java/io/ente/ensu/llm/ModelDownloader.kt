package io.ente.ensu.llm

import android.content.Context
import android.os.Environment
import android.util.Log
import io.ente.ensu.bindings.LlmModelDownloadCallback
import io.ente.ensu.bindings.LlmModelDownloadProgress
import io.ente.ensu.bindings.LlmModelDownloadTarget
import io.ente.ensu.bindings.llmDownloadModelFiles
import io.ente.ensu.bindings.uniffiEnsureInitialized
import io.ente.ensu.format.formatBytes
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class ModelDownloader(context: Context) {
    private data class DownloadTarget(
        val label: String,
        val url: String,
        val destination: File
    )

    private val appContext = context.applicationContext
    private val modelDir = File(appContext.noBackupFilesDir, "models")
    private val legacyModelDir =
        appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { File(it, "llm") }
    private val httpClient = OkHttpClient()

    @Volatile private var cancelled = false
    @Volatile private var active = false
    private val migrationLock = Any()
    private var migrationDone = false

    init {
        uniffiEnsureInitialized()
        modelDir.mkdirs()
    }

    val isDownloadActive: Boolean get() = active

    fun modelPath(target: LlmModelTarget): File =
        pathForUrl(modelDir, target, target.url, fallback = "model.gguf")

    fun mmprojPath(target: LlmModelTarget): File? {
        val url = target.mmprojUrl ?: return null
        return pathForUrl(modelDir, target, url, fallback = "mmproj.gguf")
    }

    fun isDownloaded(target: LlmModelTarget): Boolean {
        if (isDownloadedIn(modelDir, target)) return true
        val legacyModels = legacyModelDir?.let { File(it, "models") } ?: return false
        return isDownloadedIn(legacyModels, target)
    }

    fun cancel() {
        cancelled = true
    }

    suspend fun download(target: LlmModelTarget, onProgress: (DownloadProgress) -> Unit) {
        migrate()
        if (isDownloadedIn(modelDir, target)) return

        val downloadJob = coroutineContext[Job]
        cancelled = false
        active = true
        ModelDownloadJobService.begin(appContext) { cancelled = true }
        try {
            val targets = expectedTargets(modelDir, target).map {
                LlmModelDownloadTarget(
                    label = it.label,
                    url = it.url,
                    destinationPath = it.destination.absolutePath
                )
            }
            llmDownloadModelFiles(
                targets,
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

                    override fun isCancelled(): Boolean =
                        cancelled || downloadJob?.isCancelled == true
                }
            )
        } finally {
            active = false
            ModelDownloadJobService.end(appContext)
        }
    }

    suspend fun estimateDownloadSize(target: LlmModelTarget): Long? = withContext(Dispatchers.IO) {
        val modelFile = modelPath(target)
        val mmprojFile = mmprojPath(target)
        val mmprojUrl = target.mmprojUrl
        val modelSize = if (modelFile.exists()) {
            modelFile.length().takeIf { it > 0 }
        } else {
            fetchContentLength(target.url)
        }
        val mmprojSize = if (mmprojFile != null && !mmprojUrl.isNullOrBlank()) {
            if (mmprojFile.exists()) {
                mmprojFile.length().takeIf { it > 0 }
            } else {
                fetchContentLength(mmprojUrl)
            }
        } else {
            null
        }
        val sizes = listOfNotNull(modelSize, mmprojSize)
        if (sizes.isEmpty()) null else sizes.sum()
    }

    fun migrate() {
        synchronized(migrationLock) {
            if (migrationDone) return
            File(appContext.filesDir, "llm").deleteRecursively()
            val legacyDir = legacyModelDir
            if (legacyDir == null || !legacyDir.exists()) {
                migrationDone = true
                return
            }

            var allMoved = true
            val legacyModels = File(legacyDir, "models")
            legacyModels.walkTopDown().filter { it.isFile }.forEach { file ->
                val dest = File(modelDir, file.relativeTo(legacyModels).path)
                if (dest.exists()) return@forEach
                val staged = File(dest.parentFile, "${dest.name}.migrating")
                dest.parentFile?.mkdirs()
                runCatching {
                    file.copyTo(staged, overwrite = true)
                    check(staged.renameTo(dest)) { "rename to ${dest.absolutePath} failed" }
                }.onFailure { error ->
                    staged.delete()
                    allMoved = false
                    Log.w("ModelDownloader", "Model migration failed for ${file.absolutePath}", error)
                }
            }
            if (allMoved) {
                legacyDir.deleteRecursively()
                migrationDone = true
            }
        }
    }

    private fun expectedTargets(dir: File, target: LlmModelTarget): List<DownloadTarget> {
        val targets = mutableListOf(
            DownloadTarget("Model", target.url, pathForUrl(dir, target, target.url, "model.gguf"))
        )
        val mmprojUrl = target.mmprojUrl
        if (!mmprojUrl.isNullOrBlank()) {
            targets += DownloadTarget("Mmproj", mmprojUrl, pathForUrl(dir, target, mmprojUrl, "mmproj.gguf"))
        }
        return targets
    }

    private fun isDownloadedIn(dir: File, target: LlmModelTarget): Boolean {
        return expectedTargets(dir, target).all {
            it.destination.exists() && looksLikeGguf(it.destination)
        }
    }

    private fun pathForUrl(dir: File, target: LlmModelTarget, url: String, fallback: String): File {
        val filename = filenameForUrl(url, fallback)
        return if (target.id.startsWith("custom:")) {
            File(File(dir, "custom"), "${hash(url)}_$filename")
        } else {
            File(dir, filename)
        }
    }

    private fun filenameForUrl(url: String, fallback: String): String {
        val withoutQuery = url.substringBefore('?').substringBefore('#')
        return withoutQuery.substringAfterLast('/').ifBlank { fallback }
    }

    private fun hash(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun looksLikeGguf(file: File): Boolean {
        if (!file.exists() || file.length() < 4) return false
        val header = ByteArray(4)
        file.inputStream().use { input ->
            if (input.read(header) != 4) return false
        }
        return header.contentEquals("GGUF".toByteArray())
    }

    private fun fetchContentLength(url: String): Long? {
        val request = Request.Builder().url(url).head().build()
        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                response.body?.contentLength()?.takeIf { it > 0 }
                    ?: response.header("Content-Length")?.toLongOrNull()
            }
        } catch (_: IOException) {
            null
        }
    }

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
