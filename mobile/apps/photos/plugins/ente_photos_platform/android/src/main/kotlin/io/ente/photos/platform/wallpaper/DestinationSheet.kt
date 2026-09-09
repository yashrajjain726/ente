package io.ente.photos.platform.wallpaper

import android.app.Dialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.Window
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.ImageButton
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import io.ente.photos.platform.R

internal class DestinationSheet(context: Context, onSelected: (Destination) -> Unit) : Dialog(context) {
    private val regular = Typeface.createFromAsset(context.assets, "Inter-Regular.ttf")
    private val semibold = Typeface.createFromAsset(context.assets, "Inter-SemiBold.ttf")

    init {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window!!.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = GradientDrawable().apply {
                setColor(0xFF161616.toInt())
                cornerRadii = floatArrayOf(dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), 0f, 0f, 0f, 0f)
            }
        }
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(context).apply {
            setText(R.string.wallpaper_set)
            textSize = 18f
            typeface = semibold
            setTextColor(Color.WHITE)
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        header.addView(ImageButton(context).apply {
            setImageResource(R.drawable.wallpaper_close)
            contentDescription = context.getString(android.R.string.cancel)
            background = surface(24)
            setOnClickListener { dismiss() }
        }, LinearLayout.LayoutParams(dp(48), dp(48)))
        content.addView(header, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(16) })
        for (destination in Destination.entries) {
            content.addView(Button(context).apply {
                setText(destination.label)
                isAllCaps = false
                letterSpacing = 0f
                stateListAnimator = null
                textSize = 16f
                typeface = regular
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER_VERTICAL
                minHeight = dp(56)
                setPadding(dp(20), dp(16), dp(20), dp(16))
                background = surface(20)
                setOnClickListener {
                    dismiss()
                    onSelected(destination)
                }
            }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(8) })
        }
        setContentView(content)
        setCanceledOnTouchOutside(true)
    }

    override fun onStart() {
        super.onStart()
        window!!.apply {
            setGravity(Gravity.BOTTOM)
            setLayout(MATCH_PARENT, WRAP_CONTENT)
            setDimAmount(0.55f)
            navigationBarColor = 0xFF161616.toInt()
        }
    }

    private fun surface(radius: Int) = RippleDrawable(
        ColorStateList.valueOf(0x29FFFFFF),
        GradientDrawable().apply {
            setColor(0xFF212121.toInt())
            cornerRadius = dp(radius).toFloat()
        },
        null,
    )

    private fun dp(value: Int) = (value * context.resources.displayMetrics.density).toInt()
}
