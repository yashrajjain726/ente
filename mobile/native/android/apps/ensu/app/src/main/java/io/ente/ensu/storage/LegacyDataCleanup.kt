package io.ente.ensu.storage

import android.content.Context
import java.io.File

/**
 * One-shot removal of data written by the retired login and sync builds, so
 * that credentials and chat copies the user can no longer see or delete do not
 * linger on disk.
 *
 * Added Jul 2026, v0.1.19. Remove once old installs age out (tag: Migration).
 */
object LegacyDataCleanup {
    fun run(context: Context, credentialStore: CredentialStore) {
        credentialStore.removeLegacyCredentials()

        File(context.filesDir, "llmchat_online.db").delete()
        File(context.filesDir, "llmchat").deleteRecursively()
        File(context.filesDir, "datastore/ensu_developer_settings.preferences_pb").delete()
    }
}
