package io.ente.photos.platform.flutter

import io.ente.photos.platform.country.CountryNamesService
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

internal class CountryNamesChannelAdapter : MethodChannel.MethodCallHandler {
    private val service = CountryNamesService()
    private lateinit var channel: MethodChannel

    fun attach(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, CHANNEL)
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) =
        when (call.method) {
            "get" -> {
                val locale = call.arguments as? String
                    ?: return result.error("invalid_locale", "Expected a locale identifier", null)
                val names = service.names(locale)
                result.success(mapOf("region" to names.region, "names" to names.names))
            }

            else -> result.notImplemented()
        }

    fun detach() = channel.setMethodCallHandler(null)

    private companion object {
        const val CHANNEL = "io.ente.photos.platform/country_names"
    }
}
