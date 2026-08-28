# vecdb: process-shared handles via a per-path registry

The app holds many handles to one index at once — every Dart isolate opens its own, all inside a single process. Under the original design that meant a second in-process writer open failed `Locked`, and read-only opens were stale point-in-time copies, each holding a private copy of every vector (~230 MB at 100k×512-d per copy). This mirrors the handle-staleness bugs the app fought with usearch. vecdb now keeps a process-global registry (canonical path → weak reference) guaranteeing at most one live instance per index path per process; `open()` either creates that instance or returns another handle aliasing it, the sqlite-shared-cache model. Handles use interior locking instead of `&mut`: a writer mutex (log fd, OS lock, snapshot/compaction policy) serializes all mutation, and a read-write lock over the search state (arena + graph) lets searches run concurrently; the lock order is always writer mutex before state lock.

## Considered options

- **Keep per-handle instances, add cross-handle invalidation** — rejected: reintroduces the staleness window it is meant to close, and still duplicates vectors per handle.
- **Force the app to funnel all access through one isolate** — rejected: pushes the hardest part (lifecycle and routing) onto every consumer, which is how the usearch bugs happened.

## Consequences

- Handle staleness is structurally impossible in-process: every handle reads the same arena and graph, so a write is visible to all handles the moment it lands.
- One copy of the vectors per process, regardless of handle count.
- A second in-process `open()` joins the live instance instead of failing `Locked`; the OS advisory lock now guards purely against other processes and is held for the instance's lifetime.
- Concurrent opens serialize per path, not globally: simultaneous opens of one path coalesce onto a single load (the losers wait and then join it), while opens of different paths load in parallel — the app opening its dozen indexes at startup pays only the slowest load, not the sum.
- Bulk writes become visible per vector, not batch-atomically: the batch is durable after its single fsync, but a concurrent search may observe it partially applied (each vector individually consistent).
- `delete()` closes the shared instance: surviving handles get `Closed` on every subsequent operation, and reopening the path creates a fresh empty db. `reset()` keeps all handles live on the emptied instance.
- `open_read_only()` aliases the live writer instance when one exists (a live view that rejects mutation); with no live writer it stays a standalone point-in-time load, unregistered, for the cross-process case.
- Compaction stages and rebuilds off to the side and swaps the new state in under one short write lock, so searches keep answering from the old state for the whole rebuild.
- The last handle dropped drops the instance: fds close, the OS lock releases, and the registry entry is removed.
