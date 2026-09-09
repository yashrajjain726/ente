package io.ente.photos.platform.flutter

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

class WallpaperActivity : io.ente.photos.platform.wallpaper.WallpaperActivity() {
    override fun attachBaseContext(base: Context) {
        val language = base.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
            .getString("flutter.locale", null)
        val localized = if (language == null) base else {
            val configuration = Configuration(base.resources.configuration).apply {
                setLocale(Locale.forLanguageTag(language.replace('_', '-')))
            }
            base.createConfigurationContext(configuration)
        }
        super.attachBaseContext(localized)
    }
}
