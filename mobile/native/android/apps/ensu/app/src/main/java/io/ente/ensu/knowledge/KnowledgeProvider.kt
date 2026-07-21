package io.ente.ensu.knowledge

import io.ente.ensu.bindings.KnowledgeDatasetConfig
import io.ente.ensu.bindings.KnowledgeDownloadCallback
import io.ente.ensu.bindings.KnowledgeDownloadProgress
import io.ente.ensu.bindings.KnowledgeReconciliation
import io.ente.ensu.bindings.RetrievalHit
import io.ente.ensu.bindings.RetrievalIndex
import io.ente.ensu.bindings.cleanupObsoleteKnowledgePackRevisions
import io.ente.ensu.bindings.downloadKnowledgePack
import io.ente.ensu.bindings.reconcileKnowledgePack
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class KnowledgeSearchHit(
    val dataset: KnowledgeDatasetConfig,
    val hit: RetrievalHit
)

class KnowledgeProvider(
    private val knowledgeRoot: File,
    private val ioScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private data class ActiveMutation(
        val cancelled: AtomicBoolean,
        val task: Deferred<KnowledgeReconciliation>
    )

    private data class OpenIndex(
        val directory: String,
        val index: RetrievalIndex
    )

    private val mutationGate = Mutex()
    private val mutations = mutableMapOf<String, ActiveMutation>()
    private val lifecycleGates = mutableMapOf<String, Mutex>()
    private val indexGate = Mutex()
    private val indexes = mutableMapOf<String, OpenIndex>()

    suspend fun reconcile(dataset: KnowledgeDatasetConfig): KnowledgeReconciliation =
        lifecycleGate(dataset.stableId).withLock {
            val activeMutation = mutationGate.withLock { mutations[dataset.stableId] }
            if (activeMutation != null) {
                val result = runCatching { activeMutation.task.await() }
                mutationGate.withLock {
                    if (
                        mutations[dataset.stableId] === activeMutation &&
                        activeMutation.task.isCompleted
                    ) {
                        mutations.remove(dataset.stableId)
                    }
                }
                result.getOrNull()?.let { return@withLock it }
                currentCoroutineContext().ensureActive()
            }
            withContext(Dispatchers.IO) {
                indexGate.withLock {
                    reconcileAndOpenLocked(dataset)
                }
            }
        }

    suspend fun download(
        dataset: KnowledgeDatasetConfig,
        onProgress: (KnowledgeDownloadProgress) -> Unit
    ): KnowledgeReconciliation {
        val mutation = lifecycleGate(dataset.stableId).withLock {
            mutationGate.withLock {
                mutations[dataset.stableId] ?: run {
                    val cancelled = AtomicBoolean(false)
                    val task = ioScope.async {
                        try {
                            downloadKnowledgePack(
                                packRoot(dataset).absolutePath,
                                dataset,
                                object : KnowledgeDownloadCallback {
                                    override fun onProgress(progress: KnowledgeDownloadProgress) {
                                        onProgress(progress)
                                    }

                                    override fun isCancelled(): Boolean = cancelled.get()
                                }
                            )
                            indexGate.withLock {
                                val result = reconcileAndOpenLocked(dataset)
                                check(result.activeIdentity == dataset.currentDownloadIdentity) {
                                    "Downloaded knowledge pack failed current revision validation"
                                }
                                result
                            }
                        } catch (error: Throwable) {
                            indexGate.withLock {
                                incomingRevision(dataset).deleteRecursively()
                                runCatching { reconcileAndOpenLocked(dataset) }
                            }
                            throw error
                        }
                    }
                    ActiveMutation(cancelled, task).also {
                        mutations[dataset.stableId] = it
                    }
                }
            }
        }

        return try {
            mutation.task.await()
        } finally {
            mutationGate.withLock {
                if (mutations[dataset.stableId] === mutation && mutation.task.isCompleted) {
                    mutations.remove(dataset.stableId)
                }
            }
        }
    }

    suspend fun cancel(dataset: KnowledgeDatasetConfig): KnowledgeReconciliation {
        val mutation = mutationGate.withLock { mutations[dataset.stableId] }
        mutation?.cancelled?.set(true)
        runCatching { mutation?.task?.await() }
        mutationGate.withLock {
            if (mutations[dataset.stableId] === mutation) {
                mutations.remove(dataset.stableId)
            }
        }
        return reconcile(dataset)
    }

    suspend fun search(
        datasets: List<KnowledgeDatasetConfig>,
        query: List<Float>,
        maxHits: UInt
    ): List<KnowledgeSearchHit> = withContext(Dispatchers.IO) {
        indexGate.withLock {
            val merged = mutableListOf<KnowledgeSearchHit>()
            for (dataset in datasets) {
                currentCoroutineContext().ensureActive()
                val open = indexes[dataset.stableId] ?: continue
                val hits = try {
                    open.index.search(query, maxHits, dataset.relevanceThreshold)
                } catch (_: Throwable) {
                    continue
                }
                currentCoroutineContext().ensureActive()
                merged += hits.map { hit -> KnowledgeSearchHit(dataset, hit) }
            }
            merged.sortedByDescending { it.hit.score }.take(maxHits.toInt())
        }
    }

    private fun reconcileAndOpenLocked(dataset: KnowledgeDatasetConfig): KnowledgeReconciliation {
        val previous = indexes[dataset.stableId]
        val root = packRoot(dataset).absolutePath
        val result = reconcileKnowledgePack(root, dataset)
        val directory = result.activeDirectory
        if (directory == null) {
            indexes.remove(dataset.stableId)
            previous?.index?.destroy()
        } else if (previous?.directory != directory) {
            val replacement = RetrievalIndex.open(directory, dataset)
            indexes[dataset.stableId] = OpenIndex(directory, replacement)
            previous?.index?.destroy()
        }
        result.activeIdentity?.let { activeIdentity ->
            runCatching {
                cleanupObsoleteKnowledgePackRevisions(root, dataset, activeIdentity)
            }
        }
        return result
    }

    private fun packRoot(dataset: KnowledgeDatasetConfig): File =
        File(knowledgeRoot, dataset.stableId)

    private fun incomingRevision(dataset: KnowledgeDatasetConfig): File =
        File(packRoot(dataset), dataset.currentDownloadIdentity)

    private suspend fun lifecycleGate(stableId: String): Mutex =
        mutationGate.withLock { lifecycleGates.getOrPut(stableId) { Mutex() } }
}
