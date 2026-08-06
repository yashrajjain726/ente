package io.ente.native_video_editor

import android.content.Context
import android.graphics.Bitmap
import android.media.*
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.annotation.NonNull
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.inspector.frame.FrameExtractor
import androidx.media3.transformer.ExportException
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.roundToInt

@UnstableApi
class NativeVideoEditorPlugin : FlutterPlugin, MethodCallHandler, EventChannel.StreamHandler {
    private lateinit var channel: MethodChannel
    private lateinit var progressChannel: EventChannel
    private var progressEventSink: EventChannel.EventSink? = null
    private lateinit var context: Context
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentExportJob: Job? = null
    private val frameJobs = ConcurrentHashMap<String, Job>()
    private val frameSemaphore = Semaphore(2)

    // Unified Media3 Transformer processor for all operations
    private lateinit var media3Processor: Media3TransformerProcessor

    companion object {
        private const val TAG = "NativeVideoEditorPlugin"
    }

    override fun onAttachedToEngine(@NonNull flutterPluginBinding: FlutterPlugin.FlutterPluginBinding) {
        if (!scope.isActive) {
            scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        }
        context = flutterPluginBinding.applicationContext
        channel = MethodChannel(flutterPluginBinding.binaryMessenger, "native_video_editor")
        channel.setMethodCallHandler(this)

        progressChannel = EventChannel(flutterPluginBinding.binaryMessenger, "native_video_editor/progress")
        progressChannel.setStreamHandler(this)

        // Initialize unified Media3 processor
        media3Processor = Media3TransformerProcessor(context)
    }

    override fun onMethodCall(@NonNull call: MethodCall, @NonNull result: Result) {
        val engineScope = scope
        if (!engineScope.isActive) return
        when (call.method) {
            "processVideo" -> {
                handleProcessVideo(call, result, engineScope)
            }

            "getVideoInfo" -> {
                val videoPath = call.argument<String>("videoPath")
                if (videoPath.isNullOrBlank()) {
                    result.error("INVALID_ARGS", "Missing video path", null)
                    return
                }
                engineScope.launch {
                    try {
                        val info = getVideoInfo(videoPath)
                        withContext(Dispatchers.Main) {
                            if (canReply(engineScope)) {
                                result.success(info)
                            }
                        }
                    } catch (e: LinkageError) {
                        reportProcessingError(
                            result,
                            "INFO_LINKAGE_ERROR",
                            "Get video info",
                            e,
                            engineScope
                        )
                    } catch (e: Exception) {
                        reportProcessingError(
                            result,
                            "INFO_ERROR",
                            "Get video info",
                            e,
                            engineScope
                        )
                    }
                }
            }

            "extractFrame" -> {
                val outputPath = call.argument<String>("outputPath")
                val positionMs = call.argument<Number>("positionMs")
                if (outputPath.isNullOrBlank() || positionMs == null) {
                    result.error("INVALID_ARGS", "Invalid frame arguments", null)
                    return
                }
                handleExtractFrames(
                    call = call,
                    result = result,
                    requestId = UUID.randomUUID().toString(),
                    outputPaths = listOf(outputPath),
                    positionsMs = listOf(positionMs.toLong()),
                    engineScope = engineScope
                )
            }

            "extractTimeline" -> {
                val requestId = call.argument<String>("requestId")
                val outputPaths = call.argument<List<String>>("outputPaths")
                val positions = call.argument<List<Number>>("positionsMs")
                if (requestId.isNullOrBlank() || outputPaths == null || positions == null) {
                    result.error("INVALID_ARGS", "Invalid timeline arguments", null)
                    return
                }
                val positionsMs = positions.map(Number::toLong)
                handleExtractFrames(
                    call,
                    result,
                    requestId,
                    outputPaths,
                    positionsMs,
                    engineScope
                )
            }

            "cancelFrameExtraction" -> {
                val requestId = call.argument<String>("requestId")
                if (requestId.isNullOrBlank()) {
                    result.error("INVALID_ARGS", "Missing frame request ID", null)
                    return
                }
                val frameJob = frameJobs[requestId]
                if (frameJob == null) {
                    result.success(null)
                } else {
                    engineScope.launch {
                        frameJob.cancelAndJoin()
                        withContext(Dispatchers.Main) {
                            if (canReply(engineScope)) {
                                result.success(null)
                            }
                        }
                    }
                }
            }

            "cancelProcessing" -> {
                val exportJob = currentExportJob
                if (exportJob == null) {
                    result.success(null)
                } else {
                    engineScope.launch {
                        exportJob.cancelAndJoin()
                        withContext(Dispatchers.Main) {
                            if (canReply(engineScope)) {
                                result.success(null)
                            }
                        }
                    }
                }
            }

            else -> result.notImplemented()
        }
    }

    private fun getVideoInfo(videoPath: String): Map<String, Any> {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(videoPath)
            getVideoInfo(retriever, videoPath)
        } finally {
            retriever.release()
        }
    }

    private fun getVideoInfo(
        retriever: MediaMetadataRetriever,
        videoPath: String
    ): Map<String, Any> {
            val duration = retriever.extractMetadata(
                MediaMetadataRetriever.METADATA_KEY_DURATION
            )?.toLongOrNull() ?: run {
                Log.w(TAG, "Failed to extract duration metadata from video: $videoPath")
                0L
            }

            val width = retriever.extractMetadata(
                MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH
            )?.toIntOrNull() ?: run {
                Log.w(TAG, "Failed to extract width metadata from video: $videoPath")
                0
            }

            val height = retriever.extractMetadata(
                MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT
            )?.toIntOrNull() ?: run {
                Log.w(TAG, "Failed to extract height metadata from video: $videoPath")
                0
            }

            val rotation = retriever.extractMetadata(
                MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION
            )?.toIntOrNull() ?: run {
                Log.w(TAG, "Failed to extract rotation metadata from video: $videoPath")
                0
            }

            val bitrate = retriever.extractMetadata(
                MediaMetadataRetriever.METADATA_KEY_BITRATE
            )?.toLongOrNull()?.takeIf { it > 0 }

            val frameRate = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE
                )?.toFloatOrNull()?.takeIf { it > 0 }
            } else {
                null
            }

            val normalizedRotation = ((rotation % 360) + 360) % 360
            val swapsDimensions = normalizedRotation == 90 || normalizedRotation == 270

            return buildMap {
                put("duration", duration)
                put("width", width)
                put("height", height)
                put("displayWidth", if (swapsDimensions) height else width)
                put("displayHeight", if (swapsDimensions) width else height)
                put("rotation", normalizedRotation)
                bitrate?.let { put("bitrate", it) }
                frameRate?.let { put("frameRate", it) }
            }
    }

    private fun handleExtractFrames(
        call: MethodCall,
        result: Result,
        requestId: String,
        outputPaths: List<String>,
        positionsMs: List<Long>,
        engineScope: CoroutineScope
    ) {
        val inputPath = call.argument<String>("inputPath")
        val maxWidth = call.argument<Int>("maxWidth")
        val maxHeight = call.argument<Int>("maxHeight")
        val quality = call.argument<Int>("quality")
        val policy = call.argument<String>("policy")
        val validPaths = try {
            val inputFile = inputPath?.let(::File)?.canonicalFile
            val outputs = outputPaths.map { File(it).canonicalFile }
            inputFile != null &&
                inputFile.isFile &&
                outputs.none { it == inputFile } &&
                outputs.distinct().size == outputs.size
        } catch (_: Exception) {
            false
        }
        if (inputPath.isNullOrBlank() ||
            maxWidth == null || maxWidth <= 0 ||
            maxHeight == null || maxHeight <= 0 ||
            quality == null || quality !in 1..100 ||
            policy !in setOf("precise", "nearestSync") ||
            positionsMs.isEmpty() ||
            positionsMs.size != outputPaths.size ||
            positionsMs.any { it < 0 } ||
            outputPaths.any(String::isBlank) ||
            !validPaths
        ) {
            result.error("INVALID_ARGS", "Invalid frame extraction arguments", null)
            return
        }
        val precise = policy == "precise"
        val resultCompleted = AtomicBoolean(false)

        val job = engineScope.launch(start = CoroutineStart.LAZY) {
            val writtenFiles = mutableListOf<File>()
            try {
                val payload = frameSemaphore.withPermit {
                    val retriever = MediaMetadataRetriever()
                    var fallbackExtractor: FrameExtractor? = null
                    try {
                        retriever.setDataSource(inputPath)
                        val videoInfo = getVideoInfo(retriever, inputPath)
                        val durationMs = (videoInfo["duration"] as Long).coerceAtLeast(0L)
                        val displayWidth = videoInfo["displayWidth"] as Int
                        val displayHeight = videoInfo["displayHeight"] as Int
                        val targetSize = boundedSize(
                            displayWidth,
                            displayHeight,
                            maxWidth,
                            maxHeight
                        )
                        val option = if (precise) {
                            MediaMetadataRetriever.OPTION_CLOSEST
                        } else {
                            MediaMetadataRetriever.OPTION_CLOSEST_SYNC
                        }
                        val frames = ArrayList<Map<String, Any>>(positionsMs.size)

                        positionsMs.forEachIndexed { index, requestedPositionMs ->
                            ensureActive()
                            val positionMs = clampFramePosition(requestedPositionMs, durationMs)
                            val frame = try {
                                extractScaledFrame(
                                    retriever,
                                    positionMs * 1_000,
                                    option,
                                    targetSize.first,
                                    targetSize.second
                                )
                            } catch (error: RuntimeException) {
                                Log.w(TAG, "Platform frame decoder failed at ${positionMs}ms", error)
                                null
                            } ?: run {
                                Log.w(
                                    TAG,
                                    "Platform decoder returned no frame at ${positionMs}ms; using Media3"
                                )
                                val extractor = fallbackExtractor ?: createFallbackFrameExtractor(
                                    inputPath,
                                    targetSize.second,
                                    precise
                                ).also { fallbackExtractor = it }
                                extractFallbackFrame(extractor, positionMs)
                            }
                            ensureActive()

                            val outputFile = File(outputPaths[index])
                            outputFile.parentFile?.mkdirs()
                            try {
                                try {
                                    FileOutputStream(outputFile, false).use { stream ->
                                        if (!frame.compress(Bitmap.CompressFormat.JPEG, quality, stream)) {
                                            throw IllegalStateException("JPEG encoder rejected the frame")
                                        }
                                    }
                                } catch (error: Exception) {
                                    outputFile.delete()
                                    throw error
                                }
                                writtenFiles.add(outputFile)
                                frames.add(
                                    mapOf(
                                        "outputPath" to outputFile.path,
                                        "width" to frame.width,
                                        "height" to frame.height
                                    )
                                )
                            } finally {
                                frame.recycle()
                            }
                        }

                        mapOf<String, Any>("videoInfo" to videoInfo, "frames" to frames)
                    } finally {
                        retriever.release()
                        fallbackExtractor?.let { extractor ->
                            withContext(NonCancellable + Dispatchers.Main) {
                                extractor.close()
                            }
                        }
                    }
                }
                withContext(Dispatchers.Main) {
                    if (resultCompleted.compareAndSet(false, true) && canReply(engineScope)) {
                        result.success(payload)
                    }
                }
            } catch (e: CancellationException) {
                withContext(NonCancellable + Dispatchers.Main) {
                    if (resultCompleted.compareAndSet(false, true)) {
                        writtenFiles.forEach(File::delete)
                        if (canReply(engineScope)) {
                            result.error("FRAME_CANCELLED", "Frame extraction was cancelled", requestId)
                        }
                    }
                }
            } catch (e: Exception) {
                if (resultCompleted.compareAndSet(false, true)) {
                    writtenFiles.forEach(File::delete)
                    reportProcessingError(
                        result,
                        "FRAME_EXTRACTION_ERROR",
                        "Frame extraction",
                        e,
                        engineScope
                    )
                }
            } finally {
                frameJobs.remove(requestId, coroutineContext.job)
            }
        }
        if (frameJobs.putIfAbsent(requestId, job) != null) {
            job.cancel()
            if (resultCompleted.compareAndSet(false, true)) {
                result.error("DUPLICATE_REQUEST", "Frame request ID is already active", requestId)
            }
            return
        }
        job.start()
    }

    private fun clampFramePosition(positionMs: Long, durationMs: Long): Long {
        if (durationMs <= 0) return max(0L, positionMs)
        return positionMs.coerceIn(0L, max(0L, durationMs - 1L))
    }

    private fun boundedSize(
        width: Int,
        height: Int,
        maxWidth: Int,
        maxHeight: Int
    ): Pair<Int, Int> {
        require(width > 0 && height > 0) { "Video dimensions are unavailable" }
        val scale = minOf(
            1.0,
            maxWidth.toDouble() / width,
            maxHeight.toDouble() / height
        )
        return Pair(
            max(1, (width * scale).roundToInt()),
            max(1, (height * scale).roundToInt())
        )
    }

    private fun extractScaledFrame(
        retriever: MediaMetadataRetriever,
        positionUs: Long,
        option: Int,
        targetWidth: Int,
        targetHeight: Int
    ): Bitmap? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            return retriever.getScaledFrameAtTime(
                positionUs,
                option,
                targetWidth,
                targetHeight
            )
        }

        val source = retriever.getFrameAtTime(positionUs, option) ?: return null
        if (source.width <= targetWidth && source.height <= targetHeight) {
            return source
        }
        val scale = minOf(
            1.0,
            targetWidth.toDouble() / source.width,
            targetHeight.toDouble() / source.height
        )
        val scaled = Bitmap.createScaledBitmap(
            source,
            max(1, (source.width * scale).roundToInt()),
            max(1, (source.height * scale).roundToInt()),
            true
        )
        if (scaled !== source) source.recycle()
        return scaled
    }

    private suspend fun createFallbackFrameExtractor(
        inputPath: String,
        targetHeight: Int,
        precise: Boolean
    ): FrameExtractor = withContext(Dispatchers.Main) {
        FrameExtractor.Builder(
            context,
            MediaItem.fromUri(Uri.fromFile(File(inputPath)))
        )
            .setEffects(listOf(Presentation.createForHeight(targetHeight)))
            .setSeekParameters(
                if (precise) SeekParameters.EXACT else SeekParameters.CLOSEST_SYNC
            )
            .build()
    }

    private suspend fun extractFallbackFrame(
        extractor: FrameExtractor,
        positionMs: Long
    ): Bitmap {
        val future = withContext(Dispatchers.Main) {
            extractor.getFrame(positionMs)
        }
        val frame = future.awaitResult()
        return frame.bitmap
    }

    private suspend fun <T> ListenableFuture<T>.awaitResult(): T =
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { cancel(true) }
            addListener(
                {
                    try {
                        continuation.resumeWith(kotlin.Result.success(get()))
                    } catch (error: ExecutionException) {
                        continuation.resumeWith(
                            kotlin.Result.failure(error.cause ?: error)
                        )
                    } catch (error: Exception) {
                        continuation.resumeWith(kotlin.Result.failure(error))
                    }
                },
                MoreExecutors.directExecutor()
            )
        }

    private fun handleProcessVideo(
        call: MethodCall,
        result: Result,
        engineScope: CoroutineScope
    ) {
        val inputPath = call.argument<String>("inputPath")
        val outputPath = call.argument<String>("outputPath")
        if (inputPath.isNullOrBlank() ||
            outputPath.isNullOrBlank() ||
            currentExportJob?.isActive == true
        ) {
            result.error("INVALID_ARGS", "Invalid or concurrent export request", null)
            return
        }

        val job = engineScope.launch(start = CoroutineStart.LAZY) {
            try {
                // Collect all transformation parameters
                val trimStartMs = call.argument<Number>("trimStartMs")?.toLong()
                val trimEndMs = call.argument<Number>("trimEndMs")?.toLong()
                val rotateDegrees = call.argument<Int>("rotateDegrees")
                val cropX = call.argument<Int>("cropX")
                val cropY = call.argument<Int>("cropY")
                val cropWidth = call.argument<Int>("cropWidth")
                val cropHeight = call.argument<Int>("cropHeight")

                // Process all transformations in a single pass with Media3 Transformer
                val isReEncoded = media3Processor.processVideo(
                    inputPath = inputPath,
                    outputPath = outputPath,
                    trimStartMs = trimStartMs,
                    trimEndMs = trimEndMs,
                    rotateDegrees = rotateDegrees,
                    cropX = cropX,
                    cropY = cropY,
                    cropWidth = cropWidth,
                    cropHeight = cropHeight,
                    onProgress = { progress ->
                        engineScope.launch(Dispatchers.Main) {
                            if (canReply(engineScope)) {
                                progressEventSink?.success(progress)
                            }
                        }
                    }
                )

                withContext(Dispatchers.Main) {
                    if (canReply(engineScope)) {
                        result.success(
                            mapOf(
                                "outputPath" to outputPath,
                                "isReEncoded" to isReEncoded
                            )
                        )
                    }
                }
            } catch (e: LinkageError) {
                reportProcessingError(
                    result,
                    "PROCESS_LINKAGE_ERROR",
                    "Process video",
                    e,
                    engineScope
                )
            } catch (e: CancellationException) {
                reportProcessingError(
                    result,
                    "PROCESS_CANCELLED",
                    "Process video",
                    e,
                    engineScope
                )
            } catch (e: Exception) {
                reportProcessingError(
                    result,
                    "PROCESS_ERROR",
                    "Process video",
                    e,
                    engineScope
                )
            } finally {
                if (currentExportJob == coroutineContext.job) {
                    currentExportJob = null
                }
            }
        }
        currentExportJob = job
        job.start()
    }

    private suspend fun reportProcessingError(
        result: Result,
        code: String,
        operation: String,
        throwable: Throwable,
        engineScope: CoroutineScope
    ) {
        Log.e(TAG, "$operation failed", throwable)
        withContext(NonCancellable + Dispatchers.Main) {
            if (canReply(engineScope)) {
                result.error(
                    code,
                    throwable.message ?: throwable::class.java.simpleName,
                    buildErrorDetails(throwable)
                )
            }
        }
    }

    private fun canReply(engineScope: CoroutineScope): Boolean = engineScope.isActive

    override fun onDetachedFromEngine(@NonNull binding: FlutterPlugin.FlutterPluginBinding) {
        progressEventSink = null
        channel.setMethodCallHandler(null)
        progressChannel.setStreamHandler(null)
        scope.cancel()
        currentExportJob = null
        frameJobs.clear()
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        if (scope.isActive) {
            progressEventSink = events
        }
    }

    override fun onCancel(arguments: Any?) {
        progressEventSink = null
    }

    private fun buildErrorDetails(throwable: Throwable): Map<String, Any?> {
        val details = mutableMapOf<String, Any?>(
            "type" to throwable::class.java.simpleName,
            "message" to (throwable.message ?: "")
        )

        val exportException = when {
            throwable is ExportException -> throwable
            throwable.cause is ExportException -> throwable.cause as ExportException
            else -> null
        }

        exportException?.let {
            details["errorCode"] = it.errorCode
        }

        val rootCause = throwable.cause ?: exportException?.cause
        rootCause?.let {
            details["causeType"] = it::class.java.simpleName
            details["causeMessage"] = it.message ?: ""
        }

        return details
    }
}
