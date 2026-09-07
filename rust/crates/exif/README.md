# ente-exif

Reads EXIF, XMP and IPTC with bounded reads and owned results, without decoding
image pixels. Supports JPEG, TIFF, HEIF/AVIF, PNG, WebP, GIF, JPEG XL and explicitly
supplied XMP sidecars. It does not discover adjacent files or write metadata.

```rust,no_run
use ente_exif::{Limits, Mode};
use std::{fs::File, io::BufReader};

let mut file = BufReader::with_capacity(16 * 1024, File::open("photo.heic")?);
let metadata = ente_exif::read(&mut file, Mode::Summary, Limits::default())?;
if let Some(size) = metadata.display_dimensions() {
    println!("display size: {} × {}", size.width, size.height);
}
println!("camera: {:?} {:?}", metadata.camera_make(), metadata.camera_model());
println!("location: {:?}", metadata.exif_location());
if let Some(date) = metadata.capture_date_time() {
    println!("photo time: {}; offset: {:?}; epoch µs: {:?}; source: {:?}",
             date.date_time, date.offset_time, date.timestamp_micros, date.source);
}
println!("panorama: {}", metadata.is_panorama());
if let Some(video) = metadata.motion_video {
    println!("motion video: [{}..{})", video.start, video.end);
}
# Ok::<(), Box<dyn std::error::Error>>(())
```

Use `Cursor<&[u8]>` for bytes already in memory. `Summary` retains common photo
fields; `Details` adds general tags and properties. Use `read_structured()` when
nested XMP annotations need parent/list relationships.

## Photo metadata

- `display_dimensions()` applies container crops and orientation. `width()` and
  `height()` return stored dimensions. Use decoder output dimensions directly
  when available; do not orient them again.
- `capture_date_time()` selects a date across XMP/IPTC/EXIF and keeps local time,
  embedded offset and epoch microseconds separate. Full timestamps without an
  offset remain unresolved. `capture_date_time_with()` accepts application
  timezone/rejection policy; `date_time(source)` reads a single source.
- Camera, lens, exposure, GPS and description helpers derive values on demand.
  Location/caption source precedence and upload storage mapping belong to callers.
- `is_panorama()` recognizes GPano projections or EXIF panorama metadata.
  `motion_video` gives an appended video's half-open byte range. It may include
  vendor trailer bytes and does not establish playback support. Pairing separate
  live-photo files belongs to the caller.

## Limits

`Limits::default()` bounds logical reads to 8 MiB, individual values to 64 KiB,
retained metadata accounting to 512 KiB, entries to 16,384, TIFF directories to
64 per block and nesting to 32. Expanded text has a separate cumulative budget
equal to the read limit. These account for parser work, not exact process memory.

I/O errors and exhausted budgets stop parsing. Recoverable malformed metadata
appears in `issues`; inspect it before treating a result as complete.

BigTIFF, manufacturer MakerNotes, non-TIFF RAW adapters and metadata writing are
unsupported. JPEG scanning ends at the first image scan. PNG CRCs and extended-XMP
GUID digests are not authenticated. Structured XMP is not a complete RDF graph
or a typed face-region API.

## Development

From `rust/`:

```sh
cargo test --locked -p ente-exif
cargo test --locked -p ente-exif --test integration jxl::
cargo run --release --locked -p ente-exif --example inspect -- photo.heic
cargo run --release --locked -p ente-exif --example extract_motion -- photo.jpg motion.mp4
```

Tests generate metadata containers in memory; no downloads or external fixtures
are needed. See [fixture rules and references](tests/README.md). Shared lint and
build commands are in the [workspace README](../../README.md).
