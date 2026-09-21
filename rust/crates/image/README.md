# ente-image

`decode_bounded` accepts a path or borrowed bytes and a nonzero maximum side length:

```rust
use ente_image::{ImageInput, decode_bounded};

let decoded = decode_bounded(ImageInput::Path("photo.png"), 6000)?;
let decoded = decode_bounded(ImageInput::Bytes(&encoded_bytes), 6000)?;
```

The result contains `image`, an RGB8 `DecodedImage`, and `original_dimensions`.
Both sets of dimensions include EXIF orientation. Output preserves aspect ratio
with integer rounding, never upscales, and fits within the requested maximum side.
This API is opt-in and is not wired into ML, the viewer, or other production
callers. Existing decode entry points remain in use.

PNG is detected from its signature and decoded row by row through the `png`
crate. Pixels are converted using the existing ICC-to-sRGB handling and reduced
with an area average before applying orientation. Palette, transparency,
grayscale, 16-bit samples, and Adam7 interlacing are supported. Alpha is discarded,
matching the existing RGB decoder. APNG returns its default image.
Trailing chunks are validated too, so damaged files tolerated by the existing
decoder may be rejected here.

Non-interlaced PNG needs the reduced RGB output and a few source/target rows.
Adam7 additionally needs a floating-point accumulator at the reduced dimensions
(12 bytes per output pixel). Neither path allocates a full-resolution pixel
image when reducing. Source row width and buffer sizes are checked before decode:
the conservative row allowance is 4 MiB, the PNG decoder allowance is 32 MiB,
and the estimated working-buffer allowance is 512 MiB. Oversized requests return
`ImageError::TooLarge`; a large Adam7 output can exceed this allowance even when
its side length is permitted. These are allocation guards, not a process-wide
RSS limit; caller-owned encoded bytes and color-management allocations also use
memory. Decode time still depends on the source image size.

Only PNG is currently supported. Other formats return an unsupported-format
decode error before pixel decoding. JPEG and HEIC can be added explicitly in
later changes. There is no fallback to the existing full-image decoder, including
when PNG decoding fails.

Run the optional large-input regression with:

```sh
cargo test --release -p ente-image streams_200_megapixels -- --ignored
```
