package io.ente.ensu.llm

import io.ente.ensu.llm.LlmModelTarget
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest

internal object ModelDownloadSupport {
    data class DownloadTarget(
        val label: String,
        val url: String,
        val destination: File
    )

    fun expectedTargets(modelDir: File, target: LlmModelTarget): List<DownloadTarget> {
        val targets = mutableListOf(
            DownloadTarget("Model", target.url, modelPathFor(modelDir, target))
        )
        val mmprojUrl = target.mmprojUrl
        val mmprojPath = mmprojPathFor(modelDir, target)
        if (!mmprojUrl.isNullOrBlank() && mmprojPath != null) {
            targets += DownloadTarget("Mmproj", mmprojUrl, mmprojPath)
        }
        return targets
    }

    fun isTargetDownloaded(modelDir: File, target: LlmModelTarget): Boolean {
        return expectedTargets(modelDir, target).all {
            it.destination.exists() && looksLikeGguf(it.destination)
        }
    }

    fun modelPathFor(modelDir: File, target: LlmModelTarget): File {
        return pathForUrl(modelDir, target, target.url, fallback = "model.gguf")
    }

    fun mmprojPathFor(modelDir: File, target: LlmModelTarget): File? {
        val url = target.mmprojUrl ?: return null
        return pathForUrl(modelDir, target, url, fallback = "mmproj.gguf")
    }

    fun fetchContentLength(httpClient: OkHttpClient, url: String): Long? {
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

    fun looksLikeGguf(file: File): Boolean {
        if (!file.exists() || file.length() < 4) return false
        val header = ByteArray(4)
        file.inputStream().use { input ->
            if (input.read(header) != 4) return false
        }
        return header.contentEquals("GGUF".toByteArray())
    }

    private fun pathForUrl(modelDir: File, target: LlmModelTarget, url: String, fallback: String): File {
        val baseDir = File(modelDir, "models")
        val filename = filenameForUrl(url, fallback)
        return if (target.id.startsWith("custom:")) {
            val customDir = File(baseDir, "custom")
            File(customDir, "${hash(url)}_$filename")
        } else {
            File(baseDir, filename)
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
}
