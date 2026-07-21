package io.ente.ensu.knowledge

import io.ente.ensu.bindings.KnowledgeDatasetConfig

enum class KnowledgePackStatus {
    Checking,
    Download,
    Ready,
    UpdateAvailable
}

data class KnowledgePackState(
    val config: KnowledgeDatasetConfig,
    val status: KnowledgePackStatus = KnowledgePackStatus.Checking,
    val activeIdentity: String? = null,
    val enabled: Boolean = false,
    val isMutating: Boolean = false,
    val progressPercent: Int? = null,
    val progressLabel: String? = null,
    val errorMessage: String? = null
)

data class KnowledgeState(
    val packs: Map<String, KnowledgePackState> = emptyMap()
) {
    val enabledReadyDatasets: List<KnowledgeDatasetConfig>
        get() = packs.values
            .filter { pack ->
                pack.enabled &&
                    (pack.status == KnowledgePackStatus.Ready ||
                        pack.status == KnowledgePackStatus.UpdateAvailable)
            }
            .map { it.config }
}
