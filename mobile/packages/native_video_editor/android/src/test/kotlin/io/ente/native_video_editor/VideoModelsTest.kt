package io.ente.native_video_editor.core

import org.junit.Assert.assertEquals
import org.junit.Test

class VideoModelsTest {
    @Test
    fun metadataRotationDefinesDisplayDimensions() {
        val metadata = VideoMetadata(
            durationMs = 1_000,
            width = 1_920,
            height = 1_080,
            rotationDegrees = 270,
            bitrate = null,
            frameRate = null
        )

        assertEquals(1_080, metadata.displayWidth)
        assertEquals(1_920, metadata.displayHeight)
    }

    @Test
    fun boundedSizePreservesAspectRatioWithoutUpscaling() {
        assertEquals(
            PixelSize(width = 144, height = 81),
            boundedVideoSize(1_920, 1_080, 144, 120)
        )
        assertEquals(
            PixelSize(width = 80, height = 60),
            boundedVideoSize(80, 60, 144, 120)
        )
    }

    @Test
    fun framePositionStaysInsideMediaInterval() {
        assertEquals(0, clampFramePositionMs(-5, 1_000))
        assertEquals(999, clampFramePositionMs(1_000, 1_000))
        assertEquals(1_500, clampFramePositionMs(1_500, 0))
    }
}
