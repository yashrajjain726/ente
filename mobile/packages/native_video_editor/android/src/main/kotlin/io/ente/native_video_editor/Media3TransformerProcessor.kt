package io.ente.native_video_editor

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.ExperimentalApi
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Size
import androidx.media3.effect.Crop
import androidx.media3.effect.Presentation
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File

@UnstableApi
class Media3TransformerProcessor(private val context: Context) {
    suspend fun processVideo(
        inputPath: String,
        outputPath: String,
        trimStartMs: Long? = null,
        trimEndMs: Long? = null,
        rotateDegrees: Int? = null,
        cropX: Int? = null,
        cropY: Int? = null,
        cropWidth: Int? = null,
        cropHeight: Int? = null,
        onProgress: ((Float) -> Unit)? = null
    ): Boolean {
        val inputFile = File(inputPath).canonicalFile
        val outputFile = File(outputPath).canonicalFile
        require(inputFile.isFile && inputFile != outputFile) {
            "Input must be a video file and output must be a different path"
        }
        require((trimStartMs == null) == (trimEndMs == null)) {
            "Trim bounds must be provided together"
        }
        require(trimStartMs == null || (trimStartMs >= 0 && trimStartMs < trimEndMs!!)) {
            "Invalid trim bounds"
        }
        require(rotateDegrees == null || rotateDegrees in setOf(0, 90, 180, 270)) {
            "Invalid rotation"
        }
        val cropValues = listOf(cropX, cropY, cropWidth, cropHeight)
        require(cropValues.all { it == null } || cropValues.all { it != null }) {
            "Crop values must be provided together"
        }
        val crop = if (cropX == null) {
            null
        } else {
            CropSpec(cropX, cropY!!, cropWidth!!, cropHeight!!)
        }
        require(crop == null || crop.isPositive) { "Invalid crop rectangle" }

        return try {
            val clipRange = resolveVideoClipRangeUs(
                videoDurationUs = getVideoTrackDurationUs(inputFile.path),
                requestedStartUs = trimStartMs?.times(1_000L),
                requestedEndUs = trimEndMs?.times(1_000L)
            )
            val mediaItem = buildMediaItem(inputFile, clipRange)
            val videoInfo = crop?.let { getVideoInfo(inputFile.path) }
            val effects = buildVideoEffects(videoInfo, crop, rotateDegrees)
            val editedMediaItem = EditedMediaItem.Builder(mediaItem).apply {
                if (effects.isNotEmpty()) {
                    setEffects(Effects(emptyList(), effects))
                }
            }.build()
            @Suppress("DEPRECATION")
            val sequence = EditedMediaItemSequence.Builder(listOf(editedMediaItem)).build()
            val composition = Composition.Builder(listOf(sequence)).build()

            val exportResult = withContext(Dispatchers.Main) {
                export(
                    composition = composition,
                    outputPath = outputFile.path,
                    transcodeVideo = effects.isNotEmpty(),
                    optimizeTrim = trimStartMs != null && effects.isEmpty(),
                    onProgress = onProgress
                )
            }
            require(outputFile.isFile && outputFile.length() > 0) {
                "Output file was not created"
            }
            when (exportResult.videoConversionProcess) {
                ExportResult.CONVERSION_PROCESS_TRANSCODED,
                ExportResult.CONVERSION_PROCESS_TRANSMUXED_AND_TRANSCODED -> true
                else -> false
            }
        } catch (error: CancellationException) {
            outputFile.delete()
            throw error
        } catch (error: Exception) {
            outputFile.delete()
            throw VideoProcessingException("Video processing failed: ${error.message}", error)
        }
    }

    private fun buildMediaItem(
        inputFile: File,
        clipRange: VideoClipRangeUs
    ): MediaItem = MediaItem.Builder()
        .setUri(Uri.fromFile(inputFile))
        .setClippingConfiguration(
            MediaItem.ClippingConfiguration.Builder()
                .setStartPositionUs(clipRange.startUs)
                .setEndPositionUs(clipRange.endUs)
                .setStartsAtKeyFrame(false)
                .build()
        )
        .build()

    private fun buildVideoEffects(
        videoInfo: VideoInfo?,
        crop: CropSpec?,
        rotateDegrees: Int?
    ): List<Effect> = buildList {
        val cropSize = crop?.let {
            val video = requireNotNull(videoInfo)
            val displayWidth = if (video.rotation == 90 || video.rotation == 270) {
                video.height
            } else {
                video.width
            }
            val displayHeight = if (video.rotation == 90 || video.rotation == 270) {
                video.width
            } else {
                video.height
            }
            require(displayWidth > 0 && displayHeight > 0) {
                "Video dimensions are unavailable"
            }
            require(
                it.x.toLong() + it.width <= displayWidth &&
                    it.y.toLong() + it.height <= displayHeight
            ) { "Crop rectangle exceeds the displayed video" }

            add(
                Crop(
                    -1f + 2f * it.x / displayWidth,
                    -1f + 2f * (it.x + it.width) / displayWidth,
                    1f - 2f * (it.y + it.height) / displayHeight,
                    1f - 2f * it.y / displayHeight
                )
            )
            Size(it.width, it.height)
        }

        if (rotateDegrees != null && rotateDegrees != 0) {
            add(
                ScaleAndRotateTransformation.Builder()
                    .setRotationDegrees(-rotateDegrees.toFloat())
                    .build()
            )
        }

        if (cropSize != null) {
            val swapsDimensions = rotateDegrees == 90 || rotateDegrees == 270
            add(
                Presentation.createForWidthAndHeight(
                    if (swapsDimensions) cropSize.height else cropSize.width,
                    if (swapsDimensions) cropSize.width else cropSize.height,
                    Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP
                )
            )
        }
    }

    @androidx.annotation.OptIn(markerClass = [ExperimentalApi::class])
    private suspend fun export(
        composition: Composition,
        outputPath: String,
        transcodeVideo: Boolean,
        optimizeTrim: Boolean,
        onProgress: ((Float) -> Unit)?
    ): ExportResult = coroutineScope {
        var progressJob: Job? = null
        try {
            suspendCancellableCoroutine { continuation ->
                val transformerBuilder = Transformer.Builder(context)
                if (transcodeVideo) {
                    transformerBuilder.setVideoMimeType(MimeTypes.VIDEO_H264)
                }
                if (optimizeTrim) {
                    transformerBuilder.experimentalSetTrimOptimizationEnabled(true)
                }
                val transformer = transformerBuilder
                    .addListener(object : Transformer.Listener {
                        override fun onCompleted(
                            composition: Composition,
                            exportResult: ExportResult
                        ) {
                            if (continuation.isActive) {
                                onProgress?.invoke(1f)
                                continuation.resumeWith(Result.success(exportResult))
                            }
                        }

                        override fun onError(
                            composition: Composition,
                            exportResult: ExportResult,
                            exportException: ExportException
                        ) {
                            if (continuation.isActive) {
                                continuation.resumeWith(Result.failure(exportException))
                            }
                        }
                    })
                    .build()

                continuation.invokeOnCancellation {
                    Handler(Looper.getMainLooper()).post(transformer::cancel)
                }
                transformer.start(composition, outputPath)
                progressJob = launch {
                    val holder = ProgressHolder()
                    while (isActive && continuation.isActive) {
                        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                            onProgress?.invoke(holder.progress / 100f)
                        }
                        delay(100)
                    }
                }
            }
        } finally {
            progressJob?.cancel()
        }
    }

    private fun getVideoInfo(videoPath: String): VideoInfo {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(videoPath)
            VideoInfo(
                width = retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH
                )?.toIntOrNull() ?: 0,
                height = retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT
                )?.toIntOrNull() ?: 0,
                rotation = retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION
                )?.toIntOrNull()?.let { ((it % 360) + 360) % 360 } ?: 0
            )
        } finally {
            retriever.release()
        }
    }

    private fun getVideoTrackDurationUs(videoPath: String): Long {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(videoPath)
            for (index in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(index)
                val mimeType = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mimeType.startsWith("video/")) {
                    require(format.containsKey(MediaFormat.KEY_DURATION)) {
                        "Video track duration is unavailable"
                    }
                    return format.getLong(MediaFormat.KEY_DURATION).also {
                        require(it > 0) { "Video track duration is invalid" }
                    }
                }
            }
            throw IllegalArgumentException("Input has no video track")
        } finally {
            extractor.release()
        }
    }
}

internal data class VideoClipRangeUs(val startUs: Long, val endUs: Long)

internal fun resolveVideoClipRangeUs(
    videoDurationUs: Long,
    requestedStartUs: Long?,
    requestedEndUs: Long?
): VideoClipRangeUs {
    val startUs = requestedStartUs ?: 0L
    val endUs = minOf(requestedEndUs ?: videoDurationUs, videoDurationUs)
    require(startUs < endUs) {
        "Trim range does not overlap the video track"
    }
    return VideoClipRangeUs(startUs, endUs)
}

private data class CropSpec(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int
) {
    val isPositive: Boolean
        get() = x >= 0 && y >= 0 && width > 0 && height > 0
}

private data class VideoInfo(val width: Int, val height: Int, val rotation: Int)

class VideoProcessingException(message: String, cause: Throwable? = null) : Exception(message, cause)
