# VecDB index configuration

Every open requires the path and dimensions. Storage and distance metric are
optional and default to i8 and cosine. These settings are persisted at creation and
remain unchanged through reopen, compaction, and reset.

```rust
use ente_ml::vecdb::{DistanceMetric, StorageKind, VecDb};

let index = VecDb::open(path, 512, None, None)?;
let reader = VecDb::open_read_only(path, 512, None, None)?;
let f32_index = VecDb::open(other_path, 512, Some(StorageKind::F32), None)?;
let dot_index = VecDb::open(third_path, 512, None, Some(DistanceMetric::InnerProduct))?;
```

Both open methods validate the supplied configuration against the saved header or
an already-open instance. A mismatch returns `DimensionMismatch`, `StorageMismatch`,
or `MetricMismatch`. Omitting storage or metric requires i8 or cosine on existing
indexes too; it does not detect the saved settings. Older indexes remain readable by
specifying their original storage and `DistanceMetric::InnerProduct`.

A read-only open of a missing or incomplete index returns an empty view with the
supplied configuration without creating or modifying the file.

The Flutter constructor and read-only open accept optional `storage` and `metric`,
defaulting to i8 and cosine. Index stats report both settings.

Cosine distance is `1 - dot(a, b) / (norm(a) * norm(b))`, clamped to `[0, 2]`.
A comparison involving a zero vector has distance `1`, including two zero vectors.
Stored vectors retain their magnitudes; i8 cosine uses the quantized vectors.
Inner-product distance remains `1 - dot(a, b)`, which only ranks like cosine for
unit vectors, so an inner-product index rejects an added vector whose squared norm
is further than `1e-2` from `1` with `InvalidVector`. Cosine indexes take any
magnitude, and queries are never checked.
