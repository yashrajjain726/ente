package io.ente.ensu.llm

import android.content.Context
import android.util.Log
import io.ente.ensu.bindings.LlmChatMessage as NativeChatMessage
import io.ente.ensu.bindings.LlmChatRequest
import io.ente.ensu.bindings.LlmContext
import io.ente.ensu.bindings.LlmContextParams
import io.ente.ensu.bindings.LlmException
import io.ente.ensu.bindings.LlmGenerationEvent
import io.ente.ensu.bindings.LlmGenerationEventCallback
import io.ente.ensu.bindings.LlmGenerationSummary as NativeSummary
import io.ente.ensu.bindings.LlmModel
import io.ente.ensu.bindings.LlmModelDownloadCallback
import io.ente.ensu.bindings.LlmModelDownloadProgress
import io.ente.ensu.bindings.LlmModelDownloadTarget
import io.ente.ensu.bindings.LlmModelLoadParams
import io.ente.ensu.bindings.Transcriber
import io.ente.ensu.bindings.llmCancel
import io.ente.ensu.bindings.llmDownloadModelFiles
import io.ente.ensu.bindings.llmInitBackend
import io.ente.ensu.bindings.uniffiEnsureInitialized
import io.ente.ensu.device.AndroidDeviceCapabilityProvider
import io.ente.ensu.device.requireChatSupported
import io.ente.ensu.format.formatBytes
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.coroutines.coroutineContext
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

class LlmProvider(
    context: Context,
    private val modelDir: File,
    private val transcriber: Transcriber,
    private val deviceCapabilityProvider: AndroidDeviceCapabilityProvider,
    private val legacyModelDir: File? = null,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    private data class LoadedModelKey(
        val id: String,
        val requestedContextLength: Int?
    )

    private val httpClient = OkHttpClient()
    private val appContext = context.applicationContext

    @Volatile private var loadedModel: LlmModel? = null
    @Volatile private var loadedContext: LlmContext? = null
    @Volatile private var currentModelKey: LoadedModelKey? = null
    @Volatile private var currentContextLength: Int? = null
    @Volatile private var currentJobId: Long? = null
    @Volatile private var manualDownloadCancelled = false
    @Volatile private var manualDownloadActive = false
    private var backendInitialized = false
    private val modelLoadMutex = Mutex()
    private val migratedLegacyTargets = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    private val legacyMigrationLocks = ConcurrentHashMap<String, ReentrantLock>()

    init {
        uniffiEnsureInitialized()
        modelDir.mkdirs()
    }

    suspend fun ensureModelReady(
        target: LlmModelTarget,
        onProgress: (DownloadProgress) -> Unit
    ) {
        withContext(ioDispatcher) {
            modelLoadMutex.withLock {
                ensureModelReadyLocked(target, onProgress)
            }
        }
    }

    suspend fun generateChat(
        target: LlmModelTarget,
        messages: List<LlmMessage>,
        imageFiles: List<File>,
        temperature: Float,
        maxTokens: Int?,
        onToken: (String) -> Unit
    ): GenerationSummary = withContext(ioDispatcher) {
        deviceCapabilityProvider.chatCapability().requireChatSupported()
        val context = loadedContext ?: throw IllegalStateException("Model context not loaded")
        currentJobId = null
        val mmprojPath = if (imageFiles.isEmpty()) {
            null
        } else {
            ModelDownloadSupport.mmprojPathFor(modelDir, target)?.absolutePath
        }
        val clampedTemperature = temperature.coerceIn(0.35f, 0.7f)

        val request = LlmChatRequest(
            messages = messages.map { msg ->
                NativeChatMessage(msg.roleString(), msg.text)
            },
            templateOverride = null,
            addAssistant = true,
            imagePaths = imageFiles.map { it.absolutePath },
            mmprojPath = mmprojPath,
            mediaMarker = null,
            maxTokens = maxTokens,
            temperature = clampedTemperature,
            topP = 0.9f,
            topK = 50,
            repeatPenalty = 1.18f,
            frequencyPenalty = 0f,
            presencePenalty = 0f,
            seed = null,
            stopSequences = null,
            grammar = null
        )

        unloadTranscriptionModelIfLoaded()
        val summary = generateStreamWithCallback(context, request, onToken)
        GenerationSummary(summary.jobId, summary.generatedTokens ?: 0, summary.totalTimeMs)
    }

    suspend fun prewarmImageInference(target: LlmModelTarget) {
        withContext(ioDispatcher) {
            runCatching {
                modelLoadMutex.withLock {
                    if (!ModelDownloadSupport.isTargetDownloaded(modelDir, target)) return@withLock
                    val mmprojPath = ModelDownloadSupport.mmprojPathFor(modelDir, target)
                        ?.takeIf { it.exists() }
                        ?.absolutePath
                        ?: return@withLock
                    ensureModelReadyLocked(target) { }
                    val context = loadedContext ?: return@withLock
                    unloadTranscriptionModelIfLoaded()
                    context.prewarmMultimodal(mmprojPath, null)
                }
            }.onFailure { error ->
                Log.d("LlmProvider", "Image inference prewarm skipped", error)
            }
        }
    }

    val isManualDownloadActive: Boolean get() = manualDownloadActive

    fun isModelDownloaded(target: LlmModelTarget): Boolean {
        migrateLegacyDownloads(target)
        return ModelDownloadSupport.isTargetDownloaded(modelDir, target)
    }

    suspend fun estimateModelDownloadSize(target: LlmModelTarget): Long? = withContext(ioDispatcher) {
        val modelFile = ModelDownloadSupport.modelPathFor(modelDir, target)
        val mmprojFile = ModelDownloadSupport.mmprojPathFor(modelDir, target)
        val mmprojUrl = target.mmprojUrl
        val modelSize = if (modelFile.exists()) {
            modelFile.length().takeIf { it > 0 }
        } else {
            ModelDownloadSupport.fetchContentLength(httpClient, target.url)
        }
        val mmprojSize = if (mmprojFile != null && !mmprojUrl.isNullOrBlank()) {
            if (mmprojFile.exists()) {
                mmprojFile.length().takeIf { it > 0 }
            } else {
                ModelDownloadSupport.fetchContentLength(httpClient, mmprojUrl)
            }
        } else {
            null
        }
        val sizes = listOfNotNull(modelSize, mmprojSize)
        if (sizes.isEmpty()) null else sizes.sum()
    }

    fun loadedContextLength(target: LlmModelTarget): Int? {
        val modelKey = LoadedModelKey(target.id, target.contextLength)
        return if (currentModelKey == modelKey && loadedContext != null && loadedModel != null) {
            currentContextLength
        } else {
            null
        }
    }

    fun stopGeneration() {
        val jobId = currentJobId
        if (jobId != null) {
            llmCancel(jobId)
        } else {
            llmCancel(0)
        }
    }

    fun resetContext() {
        val model = loadedModel ?: return
        val contextParams = LlmContextParams(
            contextSize = currentContextLength,
            nThreads = null,
            nBatch = null
        )
        loadedContext?.destroy()
        loadedContext = model.newContext(contextParams)
    }

    fun cancelDownload() {
        manualDownloadCancelled = true
    }

    private fun LlmMessage.roleString(): String {
        return when (role) {
            io.ente.ensu.llm.LlmMessageRole.User -> "user"
            io.ente.ensu.llm.LlmMessageRole.Assistant -> "assistant"
            io.ente.ensu.llm.LlmMessageRole.System -> "system"
        }
    }

    private fun unloadModel() {
        loadedContext?.destroy()
        loadedContext = null
        loadedModel?.destroy()
        loadedModel = null
        currentModelKey = null
        currentContextLength = null
    }

    private fun unloadTranscriptionModelIfLoaded() {
        runCatching {
            transcriber.unloadModel()
        }.onFailure { error ->
            Log.d("LlmProvider", "Transcription model unload skipped", error)
        }
    }

    private suspend fun ensureModelReadyLocked(
        target: LlmModelTarget,
        onProgress: (DownloadProgress) -> Unit
    ) {
        deviceCapabilityProvider.chatCapability().requireChatSupported()
        val modelKey = LoadedModelKey(target.id, target.contextLength)
        if (!backendInitialized) {
            llmInitBackend()
            backendInitialized = true
        }

        if (currentModelKey == modelKey && loadedContext != null && loadedModel != null) {
            return
        }

        unloadModel()

        migrateLegacyDownloads(target)
        val modelFile = ModelDownloadSupport.modelPathFor(modelDir, target)
        if (!ModelDownloadSupport.isTargetDownloaded(modelDir, target)) {
            awaitRustForegroundDownload(target, onProgress)
        }

        onProgress(DownloadProgress(100, "Loading model...", phase = DownloadPhase.Loading))
        loadWithFallbacks(target, modelFile)
        onProgress(DownloadProgress(100, "Ready", phase = DownloadPhase.Ready))
    }

    private fun loadWithFallbacks(target: LlmModelTarget, modelFile: File) {
        val desiredCtx = target.contextLength ?: 12000
        val contexts = listOf(desiredCtx, 12000, 8192, 4096, 2048, 1024).distinct().filter { it > 0 }
        val threads = max(1, Runtime.getRuntime().availableProcessors() - 1)
        val batch = 512

        val modelParams = LlmModelLoadParams(
            modelPath = modelFile.absolutePath,
            nGpuLayers = 0,
            useMmap = true,
            useMlock = false
        )

        val model = LlmModel.load(modelParams)
        loadedModel = model

        var lastError: Throwable? = null
        for (ctx in contexts) {
            try {
                val contextParams = LlmContextParams(
                    contextSize = ctx,
                    nThreads = threads,
                    nBatch = batch
                )
                loadedContext = model.newContext(contextParams)
                currentModelKey = LoadedModelKey(target.id, target.contextLength)
                currentContextLength = ctx
                return
            } catch (err: Throwable) {
                lastError = err
            }
        }
        unloadModel()
        throw lastError ?: IllegalStateException("Failed to load model")
    }

    private suspend fun awaitRustForegroundDownload(
        target: LlmModelTarget,
        onProgress: (DownloadProgress) -> Unit
    ) {
        val downloadJob = coroutineContext[Job]
        manualDownloadCancelled = false
        manualDownloadActive = true
        ModelDownloadJobService.begin(appContext) { manualDownloadCancelled = true }
        try {
            val targets = ModelDownloadSupport.expectedTargets(modelDir, target)
                .map {
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
                        logDownloadMetrics(progress)
                        ModelDownloadJobService.update(
                            appContext,
                            progress.downloadedBytes,
                            progress.totalBytes
                        )
                        onProgress(progress.toDomainProgress())
                    }

                    override fun isCancelled(): Boolean =
                        manualDownloadCancelled || downloadJob?.isCancelled == true
                }
            )
        } finally {
            manualDownloadActive = false
            ModelDownloadJobService.end(appContext)
        }
    }

    private fun logDownloadMetrics(progress: LlmModelDownloadProgress) {
        if (progress.fileComplete) {
            Log.i(
                "LlmProvider",
                "Model download file complete label=${progress.label} " +
                    "bytes=${progress.fileDownloadedBytes} " +
                    "elapsedMs=${progress.fileElapsedMs} " +
                    "rate=${formatRate(progress.fileBytesPerSecond)} " +
                    "retries=${progress.fileRetryCount}"
            )
        }
        if (progress.complete) {
            Log.i(
                "LlmProvider",
                "Model download complete bytes=${progress.downloadedBytes} " +
                    "elapsedMs=${progress.elapsedMs} " +
                    "rate=${formatRate(progress.bytesPerSecond)} " +
                    "retries=${progress.retryCount}"
            )
        }
    }

    private fun formatRate(bytesPerSecond: Double): String {
        val bytes = if (java.lang.Double.isFinite(bytesPerSecond) && bytesPerSecond > 0.0) {
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
            "Downloading... ${io.ente.ensu.format.formatBytes(downloaded)} / ${io.ente.ensu.format.formatBytes(total)}"
        } else if (fileDownloadedBytes > 0) {
            "Downloading ${label.lowercase()}... ${io.ente.ensu.format.formatBytes(fileDownloadedBytes)}"
        } else {
            "Downloading ${label.lowercase()}..."
        }
        return DownloadProgress(percent, status)
    }

    private fun migrateLegacyDownloads(target: LlmModelTarget) {
        val legacyDir = legacyModelDir ?: return
        if (legacyDir.absolutePath == modelDir.absolutePath) return
        val migrationLock = legacyMigrationLocks.getOrPut(target.id) { ReentrantLock() }
        migrationLock.lock()

        try {
            if (migratedLegacyTargets.contains(target.id)) {
                return
            }
            val oldTargets = ModelDownloadSupport.expectedTargets(legacyDir, target)
            val newTargets = ModelDownloadSupport.expectedTargets(modelDir, target)
            oldTargets.zip(newTargets).forEach { (oldTarget, newTarget) ->
                if (!ModelDownloadSupport.looksLikeGguf(oldTarget.destination)) {
                    return@forEach
                }
                if (newTarget.destination.exists()) {
                    return@forEach
                }

                newTarget.destination.parentFile?.mkdirs()
                val moved = oldTarget.destination.renameTo(newTarget.destination)
                if (!moved) {
                    runCatching {
                        oldTarget.destination.copyTo(newTarget.destination, overwrite = false)
                        oldTarget.destination.delete()
                    }.onFailure { error ->
                        Log.w(
                            "LlmProvider",
                            "Legacy migration failed for ${oldTarget.destination.absolutePath}",
                            error
                        )
                    }
                }
            }
            migratedLegacyTargets.add(target.id)
        } finally {
            migrationLock.unlock()
            if (!migrationLock.hasQueuedThreads()) {
                legacyMigrationLocks.remove(target.id, migrationLock)
            }
        }
    }

    private fun generateStreamWithCallback(
        context: LlmContext,
        request: LlmChatRequest,
        onToken: (String) -> Unit
    ): NativeSummary {
        val callback = object : LlmGenerationEventCallback {
            override fun onEvent(event: LlmGenerationEvent) {
                when (event) {
                    is LlmGenerationEvent.Text -> {
                        currentJobId = event.jobId
                        if (event.text.isNotEmpty()) {
                            onToken(event.text)
                        }
                    }
                    is LlmGenerationEvent.Done -> {
                        currentJobId = null
                    }
                }
            }
        }

        try {
            return context.generateChatStream(request, callback)
        } finally {
            currentJobId = null
        }
    }
}
