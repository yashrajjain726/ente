package io.ente.photos.platform.wallpaper

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF

// The region is normalized to the image after applying EXIF orientation.
internal data class Crop(val region: RectF, val size: Point) {
    fun render(image: Bitmap): Bitmap {
        val result = Bitmap.createBitmap(size.x, size.y, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        canvas.drawColor(Color.BLACK)
        canvas.scale(size.x / (region.width() * image.width), size.y / (region.height() * image.height))
        canvas.translate(-region.left * image.width, -region.top * image.height)
        canvas.drawBitmap(image, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
        return result
    }
}
