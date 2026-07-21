package io.ente.ensu.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.knowledgePreferences by preferencesDataStore("ensu_knowledge_preferences")

class KnowledgePreferencesDataStore(context: Context) {
    private val preferences = context.applicationContext.knowledgePreferences

    val enabledDatasetIds: Flow<Set<String>> = preferences.data.map { values ->
        values[Keys.enabledDatasetIds].orEmpty()
    }

    suspend fun setDatasetEnabled(stableId: String, enabled: Boolean) {
        preferences.edit { values ->
            val ids = values[Keys.enabledDatasetIds].orEmpty().toMutableSet()
            if (enabled) {
                ids += stableId
            } else {
                ids -= stableId
            }
            values[Keys.enabledDatasetIds] = ids
        }
    }

    private object Keys {
        val enabledDatasetIds = stringSetPreferencesKey("enabled_dataset_ids")
    }
}
