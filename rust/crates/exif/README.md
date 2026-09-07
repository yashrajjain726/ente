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

## API contracts

Dates retain local components: offsets are minutes east of UTC, capture output
normalizes them to `±HH:MM`, and epoch timestamps use microseconds. Local text
retains nanoseconds. Unknown offsets stay unknown. Partial dates normalize to
period-start midnight UTC without inventing an embedded offset; source-specific
`date_time()` preserves precision without this normalization. Epoch zero is valid.

Capture selection uses the first parseable candidate, in this order:

| Family | Sources |
| --- | --- |
| Original | XMP `exif:DateTimeOriginal`, IPTC 2:55/60, EXIF Original, XMP `photoshop:DateCreated` |
| Digitized | XMP `exif:DateTimeDigitized`, IPTC 2:62/63, EXIF Digitized, XMP `xmp:CreateDate` |
| Metadata change | XMP `xmp:MetadataDate` |
| Modified | XMP `tiff:DateTime`, EXIF Modified, XMP `xmp:ModifyDate` |

EXIF families use their own subsecond/offset tags; inline values win. Blank
auxiliary fields mean unknown; malformed values used for conversion fail.
`capture_date_time_with()` can resolve the epoch using host timezone/DST rules or
reject a candidate with `false`. An assumed offset must not replace `offset_time`.

Display size prefers container/EXIF dimensions, then a complete XMP pair.
Native transforms apply in order. Nonzero HEIF rotation or any mirror suppresses
EXIF/XMP orientation; otherwise valid EXIF wins over XMP. XMP-only sizes use XMP
orientation. JPEG XL orientation always wins. Crops must be positive, integral,
pixel-aligned and in bounds; otherwise size is `None`. Display resampling and
pixel aspect ratio are excluded. Rotations are counterclockwise quarter turns;
mirror axes are 0 = vertical, 1 = horizontal; EXIF orientations 5–8 swap axes.

GPS helpers preserve `(0, 0)` and reject invalid/incomplete coordinates. EXIF
signed D/M/S values supply the sign only when both hemisphere references are
absent; XMP requires a suffix or reference for each axis. Camera text is trimmed;
exposure is exact rational seconds, focal length is millimetres, and legacy ISO
ratings preserve the 65535 sentinel. Text decoding requires an explicit encoding;
IPTC's declared UTF-8 overrides the fallback. Raw collections retain duplicates;
`tag()`/`property()` return the first. XMP descriptions prefer the requested
language, then `x-default`, then the first value. Structured XMP parent indices
align with properties; node parents identify enclosing structures/list items.

Motion extraction chooses the largest candidate, ending at the next video or
EOF. Explicit `MotionPhoto` values other than `1` disable detection. Panorama
means GPano cylindrical/equirectangular projection or EXIF `CustomRendered = 6`.

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
