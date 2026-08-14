package io.ente.photos.platform.flutter

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

internal class PhotosPlatformChannelAdapter : MethodChannel.MethodCallHandler {
    private val deviceHealthAdapter = DeviceHealthChannelAdapter()
    private val deviceTrashAdapter = DeviceTrashChannelAdapter()
    private lateinit var methodChannel: MethodChannel

    fun attach(binding: FlutterPlugin.FlutterPluginBinding) {
        deviceHealthAdapter.attach(binding)
        deviceTrashAdapter.attach(binding)
        methodChannel = MethodChannel(binding.binaryMessenger, METHOD_CHANNEL)
        methodChannel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (deviceHealthAdapter.handleMethodCall(call, result)) return
        if (deviceTrashAdapter.handleMethodCall(call, result)) return
        result.notImplemented()
    }

    fun detach() {
        methodChannel.setMethodCallHandler(null)
        deviceHealthAdapter.detach()
        deviceTrashAdapter.detach()
    }

    private companion object {
        const val METHOD_CHANNEL = "io.ente.photos.platform"
    }
}
