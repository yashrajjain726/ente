package io.ente.native_video_editor.core

import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.Log

class AndroidVideoMetadataReader {
    fun read(videoPath: String): VideoMetadata {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(videoPath)
            read(retriever, videoPath)
        } finally {
            retriever.release()
        }
    }

    fun read(retriever: MediaMetadataRetriever, videoPath: String): VideoMetadata {
        val durationMs = metadataLong(
            retriever,
            MediaMetadataRetriever.METADATA_KEY_DURATION,
            "duration",
            videoPath
        ) ?: 0L
        val width = metadataInt(
            retriever,
            MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH,
            "width",
            videoPath
        ) ?: 0
        val height = metadataInt(
            retriever,
            MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT,
            "height",
            videoPath
        ) ?: 0
        val rotation = metadataInt(
            retriever,
            MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION,
            "rotation",
            videoPath
        ) ?: 0
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
        require(width > 0 && height > 0 && normalizedRotation in setOf(0, 90, 180, 270)) {
            "Invalid video dimensions or rotation"
        }

        return VideoMetadata(
            durationMs = durationMs,
            width = width,
            height = height,
            rotationDegrees = normalizedRotation,
            bitrate = bitrate,
            frameRate = frameRate
        )
    }

    private fun metadataInt(
        retriever: MediaMetadataRetriever,
        key: Int,
        name: String,
        path: String
    ): Int? = retriever.extractMetadata(key)?.toIntOrNull().also {
        if (it == null) Log.w(TAG, "Failed to extract $name metadata from video: $path")
    }

    private fun metadataLong(
        retriever: MediaMetadataRetriever,
        key: Int,
        name: String,
        path: String
    ): Long? = retriever.extractMetadata(key)?.toLongOrNull().also {
        if (it == null) Log.w(TAG, "Failed to extract $name metadata from video: $path")
    }

    private companion object {
        const val TAG = "VideoMetadataReader"
    }
}
