# VecDB index configuration

Every open requires the path and dimensions. Storage is optional and defaults to
i8. It is persisted at creation and remains unchanged through reopen, compaction,
and reset.

```rust
use ente_vecdb::{StorageKind, VecDb};

let index = VecDb::open(path, 512, None)?;
let reader = VecDb::open_read_only(path, 512, None)?;
let f32_index = VecDb::open(other_path, 512, Some(StorageKind::F32))?;
```

Both open methods validate the supplied configuration against the saved header or
an already-open instance. A mismatch returns `DimensionMismatch` or
`StorageMismatch`. Omitting storage requires i8 on existing indexes too; it does
not detect the saved setting. Older indexes remain readable by specifying their
original storage.

A read-only open of a missing or incomplete index returns an empty view with the
supplied configuration without creating or modifying the file.

The Flutter constructor and read-only open accept an optional `storage`,
defaulting to i8. Index stats report the setting.

Cosine is the only distance: `1 - dot(a, b) / (norm(a) * norm(b))`, clamped to
`[0, 2]`. A comparison involving a zero vector has distance `1`, including two
zero vectors. Stored vectors retain their magnitudes; i8 cosine uses the
quantized vectors.
