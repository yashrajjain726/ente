# ente-ml — Context

Glossary of terms for the ML crate's domain. Definitions describe meaning, not implementation.

## Vector DB (vecdb)

- **VecDb** — A single persistent collection of embeddings sharing one dimensionality, addressed by a single filesystem path. The app runs many independent VecDb instances (one per embedding space). Intended to become the sole store for embeddings, not a derived cache.
- **Key** — The caller-chosen string identity of an embedding within one VecDb (non-empty UTF-8, ≤ 256 bytes): a file ID, face ID, cluster ID, etc., used directly — no integer mapping layer. Adding an existing key replaces its embedding (upsert semantics).
- **Vector Log** — The durable source of truth of a VecDb: the append-only record of every embedding entrusted to it. An acknowledged write survives process kill and power loss.
- **Graph Snapshot** — A persisted copy of the search index (HNSW graph). Purely derived state: losing or corrupting it costs rebuild time, never data.
- **Tombstone** — A logged record marking a key as removed. Tombstoned entries are dead but still occupy log and graph space until compaction.
- **Compaction** — Rewriting the vector log to contain only live entries and rebuilding the graph, triggered when dead entries exceed a threshold.
- **Writer** — The single instance per index file allowed to mutate it, enforced by an OS lock. All other opens are read-only and see a point-in-time view.
- **Flush** — Explicitly persisting the current graph snapshot so the next open needs no replay.
- **Exact search** — Brute-force scan over all live embeddings; results are ground truth.
- **Approximate search** — Index-backed (HNSW) search; may miss neighbours in exchange for speed.
- **Distance** — 1 − inner product of L2-normalized embeddings, in [0, 2]; lower is closer. The only metric vecdb speaks.
- **Embedding space** — A model-specific vector space (e.g. CLIP image 512-d, face 192-d, pet face 128-d). Embeddings from different spaces are never comparable, hence one VecDb per space.

## Legacy

- **VectorDB (usearch)** — The existing usearch-backed engine, kept intact while vecdb is validated by internal users. Same conceptual model, but persists by rewriting the entire index per mutation.
