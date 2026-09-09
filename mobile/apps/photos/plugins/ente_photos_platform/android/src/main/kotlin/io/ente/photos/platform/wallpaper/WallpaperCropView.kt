package io.ente.photos.platform.wallpaper

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import kotlin.math.max
import kotlin.math.min

internal class WallpaperCropView(context: Context, private val displaySize: Point) : View(context) {
    private var bitmap: Bitmap? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val frame = RectF()
    private var zoom = 1f
    private var centerX = 0.5f
    private var centerY = 0.5f
    private var lastX = 0f
    private var lastY = 0f
    private val gestures = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val image = bitmap ?: return false
                val before = scale(image)
                zoom = (zoom * detector.scaleFactor).coerceIn(1f, 4f)
                val after = scale(image)
                centerX += (detector.focusX - frame.centerX()) * (1 / before - 1 / after) / image.width
                centerY += (detector.focusY - frame.centerY()) * (1 / before - 1 / after) / image.height
                constrain()
                invalidate()
                return true
            }
        },
    )

    fun setImage(image: Bitmap) {
        bitmap = image
        constrain()
        invalidate()
    }

    fun saveCrop() = floatArrayOf(zoom, centerX, centerY)

    fun restoreCrop(crop: FloatArray?) {
        if (crop == null) return
        zoom = crop[0]
        centerX = crop[1]
        centerY = crop[2]
    }

    fun selection(): Crop {
        val image = checkNotNull(bitmap)
        val scale = scale(image)
        val halfWidth = frame.width() / (2 * scale * image.width)
        val halfHeight = frame.height() / (2 * scale * image.height)
        return Crop(RectF(centerX - halfWidth, centerY - halfHeight, centerX + halfWidth, centerY + halfHeight), displaySize)
    }

    fun release() {
        bitmap?.recycle()
        bitmap = null
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val fit = min(w.toFloat() / displaySize.x, h.toFloat() / displaySize.y)
        val frameWidth = displaySize.x * fit
        val frameHeight = displaySize.y * fit
        frame.set((w - frameWidth) / 2, (h - frameHeight) / 2, (w + frameWidth) / 2, (h + frameHeight) / 2)
        constrain()
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(Color.BLACK)
        canvas.save()
        canvas.clipRect(frame)
        drawImage(canvas)
        canvas.restore()
    }

    private fun drawImage(canvas: Canvas) {
        val image = bitmap ?: return
        canvas.translate(frame.centerX(), frame.centerY())
        val scale = scale(image)
        canvas.scale(scale, scale)
        canvas.drawBitmap(image, -centerX * image.width, -centerY * image.height, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val image = bitmap ?: return false
        if (!isEnabled) return false
        gestures.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                if (!gestures.isInProgress && event.pointerCount == 1) {
                    val scale = scale(image)
                    centerX -= (event.x - lastX) / (scale * image.width)
                    centerY -= (event.y - lastY) / (scale * image.height)
                    constrain()
                    invalidate()
                }
            }
            MotionEvent.ACTION_UP -> performClick()
        }
        val pointer = if (event.actionMasked == MotionEvent.ACTION_POINTER_UP && event.actionIndex == 0) 1 else 0
        lastX = event.getX(pointer)
        lastY = event.getY(pointer)
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private fun constrain() {
        val image = bitmap ?: return
        if (frame.isEmpty) return
        val scale = scale(image)
        val halfWidth = min(0.5f, frame.width() / (2 * scale * image.width))
        val halfHeight = min(0.5f, frame.height() / (2 * scale * image.height))
        centerX = centerX.coerceIn(halfWidth, 1 - halfWidth)
        centerY = centerY.coerceIn(halfHeight, 1 - halfHeight)
    }

    private fun scale(image: Bitmap) = max(frame.width() / image.width, frame.height() / image.height) * zoom

}
