package io.ente.photos.platform.systemtrash

import android.content.ContentResolver
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore

class SystemTrashService(private val contentResolver: ContentResolver) {
    fun getFiles(): List<SystemTrashFile> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()

        val queryArgs = Bundle().apply {
            putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_ONLY)
            putString(
                ContentResolver.QUERY_ARG_SQL_SELECTION,
                "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN " +
                    "(${MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE}, " +
                    "${MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO})",
            )
            putString(
                ContentResolver.QUERY_ARG_SQL_SORT_ORDER,
                "${MediaStore.Files.FileColumns.DATE_EXPIRES} DESC",
            )
        }
        return buildList {
            contentResolver.query(
                MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL),
                arrayOf(
                    MediaStore.Files.FileColumns._ID,
                    MediaStore.Files.FileColumns.DATE_EXPIRES,
                    MediaStore.Files.FileColumns.BUCKET_DISPLAY_NAME,
                ),
                queryArgs,
                null,
            )?.use { cursor ->
                while (cursor.moveToNext()) {
                    add(
                        SystemTrashFile(
                            localID = cursor.getLong(0),
                            deleteBy = cursor.getLong(1) * 1_000_000L,
                            deviceFolder = cursor.getString(2) ?: "Unknown Folder",
                        ),
                    )
                }
            }
        }
    }
}

data class SystemTrashFile(
    val localID: Long,
    val deleteBy: Long,
    val deviceFolder: String,
)
