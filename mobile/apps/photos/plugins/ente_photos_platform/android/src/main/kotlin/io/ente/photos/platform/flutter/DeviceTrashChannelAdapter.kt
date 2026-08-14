package io.ente.photos.platform.flutter

import io.ente.photos.platform.devicetrash.DeviceTrashFile
import io.ente.photos.platform.devicetrash.DeviceTrashService
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

internal class DeviceTrashChannelAdapter {
    private lateinit var service: DeviceTrashService

    fun attach(binding: FlutterPlugin.FlutterPluginBinding) {
        service = DeviceTrashService(binding.applicationContext)
    }

    fun handleMethodCall(call: MethodCall, result: MethodChannel.Result): Boolean =
        when (call.method) {
            "deviceTrash.getFiles" -> {
                service.getFiles { filesResult ->
                    filesResult.fold(
                        onSuccess = { files -> result.success(files.map { it.toChannelMap() }) },
                        onFailure = { error ->
                            result.error(
                                when (error) {
                                    is UnsupportedOperationException ->
                                        "device_trash_unsupported"

                                    else -> "device_trash_query_failed"
                                },
                                error.message,
                                null,
                            )
                        },
                    )
                }
                true
            }

            else -> false
        }

    fun detach() {
        service.close()
    }

    private fun DeviceTrashFile.toChannelMap(): Map<String, Any> =
        mapOf(
            "localID" to localID,
            "deleteBy" to deleteBy,
            "deviceFolder" to deviceFolder,
        )
}
