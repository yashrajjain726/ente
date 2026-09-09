package io.ente.photos.platform.wallpaper

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Point
import android.graphics.RectF
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors

@android.annotation.TargetApi(24)
internal class WallpaperSession(context: Context, private val uri: Uri?, private val size: Point) : AutoCloseable {
    private val service = WallpaperService(context.applicationContext)
    private val executor = Executors.newSingleThreadExecutor()

    fun preview(): CompletableFuture<ByteArray> = CompletableFuture.supplyAsync({
        require(uri?.scheme == ContentResolver.SCHEME_CONTENT) { "Expected an image content URI" }
        if (!service.isAvailable) throw UnsupportedOperationException("Wallpaper changes are not allowed")
        val bitmap = service.decode(requireNotNull(uri), size)
        try {
            ByteArrayOutputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
                it.toByteArray()
            }
        } finally {
            bitmap.recycle()
        }
    }, executor)

    fun apply(region: RectF, destination: Destination): CompletableFuture<Unit> = CompletableFuture.supplyAsync({
        val bitmap = service.render(requireNotNull(uri), Crop(region, size))
        try {
            service.apply(bitmap, destination)
        } finally {
            bitmap.recycle()
        }
    }, executor)

    override fun close() { executor.shutdown() }
}
