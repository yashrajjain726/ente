package io.ente.ensu.knowledge

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import io.ente.ensu.AppState
import io.ente.ensu.bindings.KnowledgeDatasetConfig
import io.ente.ensu.bindings.KnowledgeReconciliation
import io.ente.ensu.bindings.KnowledgeReconciliationStatus
import io.ente.ensu.device.isChatSupported
import io.ente.ensu.logging.FileLogRepository
import io.ente.ensu.logging.LogLevel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val Context.knowledgePreferences by preferencesDataStore("ensu_knowledge_preferences")

data class KnowledgeMutationProgress(val percent: Int, val label: String)

data class KnowledgePackState(
    val config: KnowledgeDatasetConfig,
    val status: KnowledgeReconciliationStatus? = null,
    val activeIdentity: String? = null,
    val enabled: Boolean = false,
    val mutationProgress: KnowledgeMutationProgress? = null,
    val errorMessage: String? = null
) {
    val isMutating: Boolean get() = mutationProgress != null
}

data class KnowledgeState(
    val packs: Map<String, KnowledgePackState> = emptyMap()
) {
    val enabledReadyDatasets: List<KnowledgeDatasetConfig>
        get() = packs.values
            .filter { pack ->
                pack.enabled &&
                    (pack.status == KnowledgeReconciliationStatus.READY ||
                        pack.status == KnowledgeReconciliationStatus.UPDATE_AVAILABLE)
            }
            .map { it.config }
}

class KnowledgeStore(
    context: Context,
    private val state: MutableStateFlow<AppState>,
    private val provider: KnowledgeProvider,
    datasets: List<KnowledgeDatasetConfig>,
    private val logRepository: FileLogRepository
) {
    private val preferences = KnowledgePreferences(context)
    private val catalog = datasets.associateBy { it.stableId }
    private val jobs = mutableMapOf<String, Job>()
    private var scope: CoroutineScope? = null

    fun bootstrap(scope: CoroutineScope) {
        this.scope = scope
        state.update { appState ->
            appState.copy(
                knowledge = KnowledgeState(
                    packs = catalog.mapValues { (_, config) -> KnowledgePackState(config) }
                )
            )
        }
        scope.launch {
            val requestedEnabled = runCatching {
                preferences.enabledDatasetIds.first()
            }.getOrDefault(emptySet())
            catalog.values.forEach { dataset ->
                val result = runCatching { provider.reconcile(dataset) }
                updatePack(dataset.stableId) { current ->
                    result.fold(
                        onSuccess = { reconciliation ->
                            current.fromReconciliation(
                                reconciliation,
                                enabled = dataset.stableId in requestedEnabled
                            )
                        },
                        onFailure = { error ->
                            current.copy(
                                status = KnowledgeReconciliationStatus.DOWNLOAD,
                                enabled = false,
                                errorMessage = error.message
                            )
                        }
                    )
                }
            }
        }
    }

    fun downloadOrUpdate(stableId: String) {
        if (!state.value.chat.deviceCapability.isChatSupported()) return
        val dataset = catalog[stableId] ?: return
        val ownerScope = scope ?: return
        if (jobs[stableId]?.isActive == true) return
        val wasInstalled = state.value.knowledge.packs[stableId]?.activeIdentity != null
        updatePack(stableId) {
            it.copy(
                mutationProgress = KnowledgeMutationProgress(0, "Starting download..."),
                errorMessage = null
            )
        }
        jobs[stableId] = ownerScope.launch {
            try {
                val reconciliation = provider.download(dataset) { progress ->
                    updatePack(stableId) { current ->
                        current.copy(
                            mutationProgress = KnowledgeMutationProgress(
                                progress.percentage.toInt().coerceIn(0, 100),
                                progress.label
                            )
                        )
                    }
                }
                val shouldEnable = !wasInstalled &&
                    reconciliation.status == KnowledgeReconciliationStatus.READY
                if (shouldEnable) {
                    preferences.setDatasetEnabled(stableId, true)
                }
                val enabled = if (wasInstalled) {
                    state.value.knowledge.packs[stableId]?.enabled == true
                } else {
                    shouldEnable
                }
                updatePack(stableId) {
                    it.fromReconciliation(reconciliation, enabled).copy(
                        mutationProgress = null
                    )
                }
            } catch (error: Throwable) {
                val reconciled = runCatching { provider.reconcile(dataset) }.getOrNull()
                updatePack(stableId) { current ->
                    (reconciled?.let {
                        current.fromReconciliation(it, current.enabled)
                    } ?: current).copy(
                        mutationProgress = null,
                        errorMessage = error.message ?: "Knowledge pack setup failed"
                    )
                }
                logRepository.log(
                    LogLevel.Error,
                    "Knowledge pack setup failed",
                    details = "pack=$stableId error=${error.message}",
                    tag = "Knowledge"
                )
            } finally {
                jobs.remove(stableId)
            }
        }
    }

    fun cancel(stableId: String) {
        val dataset = catalog[stableId] ?: return
        val ownerScope = scope ?: return
        val ownerJob = jobs[stableId]
        ownerScope.launch {
            val result = runCatching { provider.cancel(dataset) }.getOrNull()
            ownerJob?.join()
            updatePack(stableId) { current ->
                (result?.let { current.fromReconciliation(it, current.enabled) } ?: current).copy(
                    mutationProgress = null
                )
            }
        }
    }

    fun setEnabled(stableId: String, enabled: Boolean) {
        val pack = state.value.knowledge.packs[stableId] ?: return
        if (pack.activeIdentity == null || pack.isMutating) return
        val ownerScope = scope ?: return
        updatePack(stableId) { it.copy(enabled = enabled) }
        ownerScope.launch {
            preferences.setDatasetEnabled(stableId, enabled)
        }
    }

    private fun updatePack(
        stableId: String,
        transform: (KnowledgePackState) -> KnowledgePackState
    ) {
        state.update { appState ->
            val current = appState.knowledge.packs[stableId] ?: return@update appState
            appState.copy(
                knowledge = appState.knowledge.copy(
                    packs = appState.knowledge.packs + (stableId to transform(current))
                )
            )
        }
    }

    private fun KnowledgePackState.fromReconciliation(
        result: KnowledgeReconciliation,
        enabled: Boolean
    ): KnowledgePackState = copy(
        status = result.status,
        activeIdentity = result.activeIdentity,
        enabled = enabled && result.activeIdentity != null,
        errorMessage = null
    )
}

private class KnowledgePreferences(context: Context) {
    private val preferences = context.applicationContext.knowledgePreferences

    val enabledDatasetIds: Flow<Set<String>> = preferences.data.map { values ->
        values[Keys.enabledDatasetIds].orEmpty()
    }

    suspend fun setDatasetEnabled(stableId: String, enabled: Boolean) {
        preferences.edit { values ->
            val ids = values[Keys.enabledDatasetIds].orEmpty()
            values[Keys.enabledDatasetIds] = if (enabled) ids + stableId else ids - stableId
        }
    }

    private object Keys {
        val enabledDatasetIds = stringSetPreferencesKey("enabled_dataset_ids")
    }
}
