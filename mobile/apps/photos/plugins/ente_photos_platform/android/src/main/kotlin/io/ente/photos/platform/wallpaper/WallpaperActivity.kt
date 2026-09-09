package io.ente.photos.platform.wallpaper

import android.app.Activity
import android.content.ContentResolver
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Point
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import io.ente.photos.platform.R
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors

@android.annotation.TargetApi(24)
class WallpaperActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var preview: WallpaperCropView
    private lateinit var applyButton: Button
    private lateinit var progress: ProgressBar
    private lateinit var service: WallpaperService
    private lateinit var imageUri: Uri
    private var pendingApply: CompletableFuture<Unit>? = null
    private var destinationSheet: DestinationSheet? = null
    private var loaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("UNCHECKED_CAST", "DEPRECATION")
        val retained = lastNonConfigurationInstance as? CompletableFuture<Unit>
        pendingApply = retained
        service = WallpaperService(this)
        if (!service.isAvailable) {
            Toast.makeText(this, R.string.wallpaper_unavailable, Toast.LENGTH_LONG).show()
            finish()
            return
        }
        val uri = intent.data
        if (uri?.scheme != ContentResolver.SCHEME_CONTENT) {
            showFailure(IllegalArgumentException("Expected an image content URI"))
            finish()
            return
        }
        imageUri = uri
        val displaySize = Point()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealSize(displaySize)
        preview = WallpaperCropView(this, displaySize)
        preview.restoreCrop(savedInstanceState?.getFloatArray("crop"))
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setOnApplyWindowInsetsListener { view, insets ->
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
                insets
            }
        }
        val semibold = Typeface.createFromAsset(assets, "Inter-SemiBold.ttf")
        val header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(4), dp(20), dp(4))
        }
        header.addView(ImageButton(this).apply {
            setImageResource(R.drawable.wallpaper_close)
            contentDescription = getString(android.R.string.cancel)
            background = RippleDrawable(ColorStateList.valueOf(0x29FFFFFF), null, null)
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(48), dp(48)))
        header.addView(TextView(this).apply {
            setText(R.string.wallpaper)
            typeface = semibold
            textSize = 18f
            setTextColor(Color.WHITE)
        })
        content.addView(header)
        content.addView(preview, LinearLayout.LayoutParams(-1, 0, 1f))
        applyButton = Button(this).apply {
            setText(R.string.wallpaper_set)
            isAllCaps = false
            letterSpacing = 0f
            stateListAnimator = null
            typeface = semibold
            textSize = 16f
            minHeight = dp(56)
            setPadding(dp(20), dp(14), dp(20), dp(14))
            background = RippleDrawable(
                ColorStateList.valueOf(0x29000000),
                GradientDrawable().apply {
                    setColor(0xFF08C225.toInt())
                    cornerRadius = dp(20).toFloat()
                },
                null,
            )
            setOnClickListener { chooseDestination() }
        }
        progress = ProgressBar(this).apply {
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
        }
        val action = FrameLayout(this).apply {
            addView(applyButton, FrameLayout.LayoutParams(-1, -2))
            addView(progress, FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER))
        }
        content.addView(action, LinearLayout.LayoutParams(-1, -2).apply {
            setMargins(dp(20), dp(16), dp(20), dp(16))
        })
        setBusy(true)
        setContentView(content)
        retained?.let(::observeApply)
        executor.execute {
            try {
                val bitmap = service.decode(uri, displaySize)
                runOnUiThread {
                    if (isDestroyed) {
                        bitmap.recycle()
                    } else {
                        preview.setImage(bitmap)
                        loaded = true
                        setBusy(pendingApply != null)
                    }
                }
            } catch (error: Exception) {
                runOnUiThread {
                    if (!isDestroyed) {
                        showFailure(error)
                        finish()
                    }
                }
            }
        }
    }

    private fun chooseDestination() {
        destinationSheet = DestinationSheet(this, ::applyWallpaper).also { it.show() }
    }

    private fun applyWallpaper(destination: Destination) {
        if (pendingApply != null) return
        setBusy(true)
        val crop = preview.selection()
        val task = CompletableFuture.supplyAsync({
            val bitmap = service.render(imageUri, crop)
            try {
                service.apply(bitmap, destination)
            } finally {
                bitmap.recycle()
            }
        }, executor)
        pendingApply = task
        observeApply(task)
    }

    private fun observeApply(task: CompletableFuture<Unit>) {
        task.whenComplete { _, error ->
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                if (error == null) {
                    Toast.makeText(this, R.string.wallpaper_done, Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    showFailure(error)
                    pendingApply = null
                    setBusy(!loaded)
                }
            }
        }
    }

    private fun setBusy(busy: Boolean) {
        applyButton.isEnabled = !busy
        applyButton.alpha = if (busy) 0.4f else 1f
        applyButton.setTextColor(if (busy) Color.TRANSPARENT else Color.WHITE)
        preview.isEnabled = !busy
        progress.visibility = if (busy) View.VISIBLE else View.GONE
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun showFailure(error: Throwable) {
        Log.e("Wallpaper", "Wallpaper operation failed", error)
        Toast.makeText(this, R.string.wallpaper_failed, Toast.LENGTH_LONG).show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::preview.isInitialized) outState.putFloatArray("crop", preview.saveCrop())
        super.onSaveInstanceState(outState)
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onRetainNonConfigurationInstance(): Any? = pendingApply

    override fun onDestroy() {
        destinationSheet?.dismiss()
        executor.shutdown()
        if (::preview.isInitialized) preview.release()
        super.onDestroy()
    }
}
