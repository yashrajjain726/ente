# VecDB index configuration

New indexes default to i8 storage and cosine distance. Storage and distance metric
are persisted at creation and remain unchanged through reopen, compaction, and reset.

`VecDb::open(path, dims)` detects both settings on existing indexes, including older
inner-product indexes. `open_with_storage` and `open_with_metric` select or verify
one setting; `open_with` accepts optional storage and metric together. An explicit
setting that differs from the saved value returns `StorageMismatch` or
`MetricMismatch`. Read-only opens use the saved settings.

```rust
use ente_ml::vecdb::{DistanceMetric, StorageKind, VecDb};

let cosine = VecDb::open(path, 512)?;
let inner_product = VecDb::open_with_metric(other_path, 512, DistanceMetric::InnerProduct)?;
let f32_cosine = VecDb::open_with(third_path, 512, Some(StorageKind::F32), Some(DistanceMetric::Cosine))?;
```

The Flutter constructor exposes optional `storage` and `metric` parameters, and
index stats report both settings.

Cosine distance is `1 - dot(a, b) / (norm(a) * norm(b))`, clamped to `[0, 2]`.
A comparison involving a zero vector has distance `1`, including two zero vectors.
Stored vectors retain their magnitudes; i8 cosine uses the quantized vectors.
Inner-product distance remains `1 - dot(a, b)`.
