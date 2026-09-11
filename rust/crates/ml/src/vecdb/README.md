# VecDB index configuration

Every open requires the path, dimensions, storage, and distance metric. There are
no defaults. These settings are persisted at creation and remain unchanged through
reopen, compaction, and reset.

```rust
use ente_ml::vecdb::{DistanceMetric, StorageKind, VecDb};

let index = VecDb::open(path, 512, StorageKind::I8, DistanceMetric::Cosine)?;
let reader = VecDb::open_read_only(path, 512, StorageKind::I8, DistanceMetric::Cosine)?;
```

Both open methods validate the supplied configuration against the saved header or
an already-open instance. A mismatch returns `DimensionMismatch`, `StorageMismatch`,
or `MetricMismatch`. Older indexes remain readable by specifying their original
storage and `DistanceMetric::InnerProduct`.

A read-only open of a missing or incomplete index returns an empty view with the
supplied configuration without creating or modifying the file.

The Flutter constructor and read-only open also require `storage` and `metric`.
Index stats report both settings.

Cosine distance is `1 - dot(a, b) / (norm(a) * norm(b))`, clamped to `[0, 2]`.
A comparison involving a zero vector has distance `1`, including two zero vectors.
Stored vectors retain their magnitudes; i8 cosine uses the quantized vectors.
Inner-product distance remains `1 - dot(a, b)`.
