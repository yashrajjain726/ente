# vecdb: durable append-only vector log + derived HNSW snapshot

We replaced usearch (C++ under the hood, broken on the napi desktop toolchain, rewrites the entire index file on every mutation) with a pure-Rust engine tailored to Ente's on-device scale of 1k–200k embeddings per index. The persistence architecture splits durability from search: an append-only log of (key, vector) records is the sole source of truth — one checksummed, fsynced append per write operation gives sqlite-grade durability — while the HNSW graph is derived state, persisted as a sidecar snapshot that can always be rebuilt from the log. Losing the snapshot costs rebuild time, never data. The DB is designed to be trustworthy as the *sole* store for embeddings, so the duplicate embedding blobs in sqlite can eventually be dropped.

## Considered options

- **Incremental on-disk graph mutation (true sqlite-style paging/journaling)** — rejected: months of complexity and corruption risk for no functional gain at our scale.
- **Log only, rebuild graph on every open** — rejected: tens of seconds of rebuild at 200k×512-d on every app start.
- **Converting existing usearch files** — rejected: would mean maintaining a parser for a foreign versioned binary format for one-off use; instead indexes are refilled from sqlite via the existing migration machinery.

## Consequences

- One caller-visible path maps to two files: `<path>` (log) and `<path>.graph` (snapshot); the Rust layer owns both, consumers never see the sidecar.
- Snapshots are written lazily (mutation threshold + quiet-gap debounce + hard cap), on compaction, on explicit flush, and on open after tail replay — so a killed process pays at most one bounded replay at next open.
- Deletes are tombstones; dead entries are compacted away (log rewrite + graph rebuild) past a ~10% dead ratio with a small absolute floor.
- Exactly one writer instance per index file, enforced by an OS advisory lock; read-only opens hold no lock and no fds, and see a point-in-time view — which is what makes rename-based compaction safe on Windows.
- Single metric (inner product on L2-normalized vectors, distance = 1 − dot) and single scalar (f32) are hardcoded; the file header carries scalar/metric tags and the distance kernel sits behind one internal seam so smaller scalars (f16/i8) can be added without a format break.
- Keys are strings (non-empty UTF-8, ≤ 256 bytes), not integers: file/face/cluster IDs are used directly, which clears the way to retire the four AUTOINCREMENT key-mapping tables the app kept in sqlite solely for usearch's u64 keys once vecdb replaces usearch. Internally keys are interned to u32 slots; the graph, arena, and log replay speak slots.
- Vectors live on disk as raw little-endian f32 payloads in the framed log records, and in memory in a chunked, 32-byte-aligned arena (chunks of SIMD lanes; free-list slot reuse; growth never reallocates existing chunks). Memory-mapping the log was rejected: it breaks wasm compatibility, fights rename-based compaction on Windows, and framed records give no alignment guarantee.
- vecdb is layered as an IO-free core (graph, arena, SIMD kernels — wasm32-compatible) beneath a native-only storage layer (fs, fsync, locking). The writer lock is hand-rolled (`flock` on unix, `LockFileEx` on Windows) rather than a crate: with `wide`, `crc32fast`, `libc`, and `windows-sys` already in the dependency tree, vecdb adds zero new Cargo.lock entries.
- usearch stays in the tree, feature-gated, while vecdb runs as a parallel engine for internal users; removal is a separate later decision.
- Derived-state failures degrade instead of failing writes: snapshot and compaction errors are logged as warnings and never fail an acknowledged write, open never fails for snapshot reasons, and only an explicit `flush()` surfaces snapshot errors to the caller.
