package io.ente.photos.platform

import io.ente.photos.platform.flutter.DeviceHealthChannelAdapter
import io.flutter.embedding.engine.plugins.FlutterPlugin

class PhotosPlatformPlugin : FlutterPlugin {
    private val deviceHealthAdapter = DeviceHealthChannelAdapter()

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        deviceHealthAdapter.attach(binding)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        deviceHealthAdapter.detach()
    }
}
