package io.ente.ensu.knowledge

import io.ente.ensu.AppState
import io.ente.ensu.bindings.KnowledgeDatasetConfig
import io.ente.ensu.bindings.KnowledgeReconciliation
import io.ente.ensu.bindings.KnowledgeReconciliationStatus
import io.ente.ensu.device.isChatSupported
import io.ente.ensu.logging.FileLogRepository
import io.ente.ensu.logging.LogLevel
import io.ente.ensu.settings.KnowledgePreferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class KnowledgeActions(
    private val state: MutableStateFlow<AppState>,
    private val preferences: KnowledgePreferencesDataStore,
    private val provider: KnowledgeProvider,
    datasets: List<KnowledgeDatasetConfig>,
    private val logRepository: FileLogRepository
) {
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
                                status = KnowledgePackStatus.Download,
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
                isMutating = true,
                progressPercent = 0,
                progressLabel = "Starting download...",
                errorMessage = null
            )
        }
        jobs[stableId] = ownerScope.launch {
            try {
                val reconciliation = provider.download(dataset) { progress ->
                    updatePack(stableId) { current ->
                        current.copy(
                            progressPercent = progress.percentage.toInt().coerceIn(0, 100),
                            progressLabel = progress.label,
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
                        isMutating = false,
                        progressPercent = null,
                        progressLabel = null
                    )
                }
            } catch (error: Throwable) {
                val reconciled = runCatching { provider.reconcile(dataset) }.getOrNull()
                updatePack(stableId) { current ->
                    (reconciled?.let {
                        current.fromReconciliation(it, current.enabled)
                    } ?: current).copy(
                        isMutating = false,
                        progressPercent = null,
                        progressLabel = null,
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
                    isMutating = false,
                    progressPercent = null,
                    progressLabel = null
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
        status = when (result.status) {
            KnowledgeReconciliationStatus.DOWNLOAD -> KnowledgePackStatus.Download
            KnowledgeReconciliationStatus.READY -> KnowledgePackStatus.Ready
            KnowledgeReconciliationStatus.UPDATE_AVAILABLE -> KnowledgePackStatus.UpdateAvailable
        },
        activeIdentity = result.activeIdentity,
        enabled = enabled && result.activeIdentity != null,
        errorMessage = null
    )
}
