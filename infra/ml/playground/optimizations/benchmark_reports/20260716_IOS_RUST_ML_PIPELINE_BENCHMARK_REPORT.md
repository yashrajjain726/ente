# iOS Rust ML indexing and HEIC decoder benchmark

Date: 2026-07-16

Code revision: `7571009d6e` plus temporary, uncommitted benchmark instrumentation and decoder prototypes

Device: iPhone 15 Pro (A17 Pro), iOS 26.5, wired device ID `00008130-00067DD02212001C`

Build: Flutter profile mode with the Rust release library

Workload: all 14 Rust ML indexing parity fixtures, faces + CLIP enabled, pets disabled

## Executive summary

The four implemented pure-Rust decoder improvements cut the five-fixture HEIC
decode sum from 3,021.6 ms to 1,918.4 ms (**36.5% less time, 1.58× as fast**)
and cut the full-corpus Rust total from 3,868.8 ms to 2,776.7 ms (**28.2% less
time**). The largest gains are on the grid-heavy fixtures: pano decode is 53.1%
faster and the text/grid fixture is 50.0% faster. All five HEICs retain face and
CLIP parity.

In an optimized device build, the current decoder spends 3,256 ms of a 3,869 ms representative corpus pass decoding (84.2%). The five HEIC files account for 3,022 ms of decode time. The earlier debug-build measurements overstated absolute latency by roughly an order of magnitude; all results and recommendations in this report use fresh profile/Rust-release runs.

Four alternatives were benchmarked on the same phone:

| Decoder | HEIC decode sum | HEIC speedup | Full-corpus Rust total | Corpus reduction | HEIC parity |
|---|---:|---:|---:|---:|---|
| Current `heic-decoder` | 3,021.6 ms | 1.00× | 3,868.8 ms | — | 5/5 pass |
| `speed_improvements` (four cumulative changes) | **1,918.4 ms** | **1.58×** | **2,776.7 ms** | **28.2%** | 5/5 pass |
| ImageIO + current-decoder fallback | 1,846.9 ms | 1.64× | 2,695.1 ms | 30.3% | 5/5 pass |
| `heic` 0.1.6 | 1,875.5 ms | 1.61× | 2,721.7 ms | 29.7% | 5/5 pass |
| `libheif-rs` 2.7.0 + libde265 | **1,625.3 ms** | **1.86×** | **2,492.8 ms** | **35.6%** | 5/5 pass |

`libheif-rs` is the fastest complete decoder in this corpus. ImageIO is much faster on the three HEICs it accepts (4.1–7.2×), but rejects the two deliberately problematic/grid fixtures. An ImageIO-first path with the current decoder as fallback is therefore nearly as fast as the pure-Rust `heic` crate across the whole corpus, preserves parity, and avoids adding a third-party decoder to the iOS application.

The `heic` crate is particularly strong on the two problematic fixtures, but its `AGPL-3.0-only OR commercial` license is a shipping blocker without an appropriate commercial license. `libheif-rs` itself is MIT, while the native libheif/libde265 stack and its static-linking implications require a separate license and distribution review.

## Method and important correction

Each run used one full warm-up pass followed by five measured passes per fixture. Tables report the median of those five passes. `Rust total` starts immediately before decoding and ends after face and CLIP analysis, so it measures exactly the interval requested. `Decode` includes file access, container/codec work, RGB output, color handling, and orientation. Model session creation is excluded by the warm-up.

The first version of this report mistakenly described the iOS run as profile mode because the test harness printed its Android build-mode setting. The actual iOS command defaulted to debug, and Rust was unoptimized. I discarded those absolute measurements and reran the current decoder and all alternatives with `flutter drive --profile` and the Rust release library. The release results below are internally comparable.

Runs were sequential rather than randomized. Medians limit transient noise, but thermal state and background phone activity can still move results by a few percent. The large differences are robust; close differences such as ImageIO hybrid versus `heic` should be treated as a tie until an uninstrumented randomized A/B run.

The instrumentation logs synchronously, so it adds a small common overhead. Final production validation should remove logging and compare wall-clock throughput.

## Current decoder baseline

Times are milliseconds. File size is compressed on-disk size; megapixels are final oriented dimensions. `Rest` is all warmed preprocessing, inference, alignment, postprocessing, and small unassigned overhead after subtracting decode from Rust total.

| Fixture | File size | Resolution | MP | Rust total | Decode | Rest | Decode share |
|---|---:|---:|---:|---:|---:|---:|---:|
| `1343_rotate_90_cw.jpg` | 2.75 MiB | 2835×2200 | 6.24 | 76.8 | 39.1 | 37.7 | 50.9% |
| `1718_rotate_90_cw.HEIC` | 4.75 MiB | 3504×2439 | 8.55 | 600.4 | 555.8 | 44.6 | 92.6% |
| `7765_horizontal_normal.HEIC` | 4.67 MiB | 3250×4333 | 14.08 | 760.0 | 715.3 | 44.7 | 94.1% |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 0.63 MiB | 1547×1209 | 1.87 | 145.4 | 100.5 | 44.9 | 69.1% |
| `IMG_0682_pano.HEIC` | 7.52 MiB | 14604×3826 | 55.87 | 1,365.6 | 1,316.4 | 49.2 | 96.4% |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 1.34 MiB | 3024×4032 | 12.19 | 380.8 | 333.7 | 47.2 | 87.6% |
| `IMG_8905.CR2` | 25.14 MiB | 5184×3456 | 17.92 | 135.2 | 85.6 | 49.6 | 63.3% |
| `IMG_pano.jpg` | 5.93 MiB | 7872×1280 | 10.08 | 107.9 | 66.2 | 41.8 | 61.3% |
| `astronaut.png` | 0.40 MiB | 512×512 | 0.26 | 40.1 | 2.6 | 37.6 | 6.4% |
| `man.jpeg` | 0.004 MiB | 275×183 | 0.05 | 37.7 | 0.3 | 37.4 | 0.7% |
| `people.jpeg` | 0.009 MiB | 275×183 | 0.05 | 50.5 | 0.4 | 50.1 | 0.9% |
| `singapore.jpg` | 0.59 MiB | 1920×1200 | 2.30 | 47.4 | 11.1 | 36.2 | 23.5% |
| `starwatchers.jpg` | 0.08 MiB | 500×724 | 0.36 | 42.0 | 4.5 | 37.5 | 10.7% |
| `ui_app.webp` | 0.11 MiB | 1070×1974 | 2.11 | 79.0 | 25.1 | 53.9 | 31.7% |
| **Corpus total** | — | — | — | **3,868.8** | **3,256.4** | **612.4** | **84.2%** |

Among only the five HEIC fixtures, compressed file size and pixel count are both strongly associated with current decode time (Pearson `r=0.958` and `r=0.931`, respectively), but five deliberately varied samples are too few for a predictive model. File size alone is not sufficient because compression structure and grid/tile layout matter.

The pano should not be treated as a pathological per-pixel result. It is 55.9 MP—roughly four to seven times the ordinary HEICs—and takes 23.6 ms/MP, versus 50.8–65.0 ms/MP for the first three HEICs. Its absolute time is large because the output is enormous, not because it decodes unusually poorly per pixel.

## Detailed current-decoder pipeline breakdown

This is the release-mode equivalent of the original detailed table. Times are milliseconds. `Preprocess` combines YOLO and CLIP preprocessing. `Inference` combines face detection, all face embeddings, and CLIP image inference. `Align + postprocess` combines face alignment and all measured detection/embedding postprocessing.

`End-to-end Dart` is the five-run average recorded by the parity runner. Each Rust stage is the median of its five measured samples, so component columns may differ slightly from the Rust total because medians are calculated independently. The CR2 Rust row represents the successful JPEG retry; its Dart time also includes the failed direct Rust attempt and Dart RAW decode/JPEG conversion.

| Fixture | File size | Resolution | MP | End-to-end Dart | Rust total median (range) | Decode | Preprocess | Inference | Align + postprocess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `1343_rotate_90_cw.jpg` | 2.75 MiB | 2835×2200 | 6.24 | 78 | 76.8 (76.1–84.9) | 39.1 | 3.8 | 33.4 | 0.0 |
| `1718_rotate_90_cw.HEIC` | 4.75 MiB | 3504×2439 | 8.55 | 603 | 600.4 (598.8–607.6) | 555.8 | 4.4 | 41.4 | 0.4 |
| `7765_horizontal_normal.HEIC` | 4.67 MiB | 3250×4333 | 14.08 | 762 | 760.0 (756.9–767.1) | 715.3 | 5.5 | 41.6 | 0.5 |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 0.63 MiB | 1547×1209 | 1.87 | 146 | 145.4 (143.0–148.0) | 100.5 | 2.7 | 41.8 | 0.4 |
| `IMG_0682_pano.HEIC` | 7.52 MiB | 14604×3826 | 55.87 | 1,360 | 1,365.6 (1,343.0–1,368.0) | 1,316.4 | 6.1 | 43.0 | 0.4 |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 1.34 MiB | 3024×4032 | 12.19 | 380 | 380.8 (375.0–382.8) | 333.7 | 5.3 | 39.1 | 0.0 |
| `IMG_8905.CR2` | 25.14 MiB | 5184×3456 | 17.92 | 3,666 | 135.2 (132.9–136.9) | 85.6 | 6.5 | 42.0 | 0.0 |
| `IMG_pano.jpg` | 5.93 MiB | 7872×1280 | 10.08 | 109 | 107.9 (107.5–113.0) | 66.2 | 1.8 | 40.0 | 0.3 |
| `astronaut.png` | 0.40 MiB | 512×512 | 0.26 | 40 | 40.1 (39.6–40.4) | 2.6 | 2.3 | 34.8 | 0.4 |
| `man.jpeg` | 0.004 MiB | 275×183 | 0.05 | 38 | 37.7 (37.5–38.4) | 0.3 | 2.0 | 34.9 | 0.4 |
| `people.jpeg` | 0.009 MiB | 275×183 | 0.05 | 52 | 50.5 (50.0–51.1) | 0.4 | 2.1 | 44.7 | 2.9 |
| `singapore.jpg` | 0.59 MiB | 1920×1200 | 2.30 | 48 | 47.4 (46.7–48.9) | 11.1 | 2.4 | 33.9 | 0.0 |
| `starwatchers.jpg` | 0.08 MiB | 500×724 | 0.36 | 43 | 42.0 (41.8–42.4) | 4.5 | 2.0 | 35.2 | 0.4 |
| `ui_app.webp` | 0.11 MiB | 1070×1974 | 2.11 | 81 | 79.0 (77.7–85.8) | 25.1 | 2.0 | 48.9 | 2.9 |
| **Corpus total** | — | — | — | **7,406** | **3,868.8** | **3,256.4** | **49.1** | **554.6** | **9.0** |

The summed Rust stage medians account for 3,869.1 ms versus the 3,868.8 ms sum of per-image Rust total medians; the 0.3 ms difference is the expected independent-median and rounding effect. Excluding the CR2 Dart fallback, Dart and Rust totals track closely. The release data confirms that warmed inference is comparatively stable at roughly 34–49 ms per fixture, while HEIC decode varies from 100 ms to 1.32 seconds with image size and structure.

## Cumulative `speed_improvements` benchmark

This run uses the local `speed_improvements` decoder through a temporary path
dependency at revision `1ac5834` and exercises all four committed changes:

1. production builds compile out diagnostic counters and CTU tracking;
2. grid tiles decode in bounded deterministic parallel batches;
3. the Ente path consumes the decoder's direct RGB8 output before applying the
   existing ICC and orientation steps; and
4. exact ARM NEON kernels accelerate dequantization and residual addition.

Unlike the older baseline, this validation is a genuine Flutter release build:
Xcode built `Release-iphoneos`, Dart reported `dart.vm.product=true` and
`dart.vm.profile=false`, and both Rust bridge pods used Cargo `--release` for
`aarch64-apple-ios`. The physical device was the same wired iPhone 15 Pro. Each
row discards one fixture-local warmup and reports the median and range of five
measured native Rust calls. The transcript contains exactly 84 structured
samples (14 fixtures × 6 calls).

The old baseline used Flutter profile with the same Rust release optimization.
The table therefore compares timings recorded wholly inside the optimized Rust
call, not Dart wall time. Non-HEIC rows act as a control and are mostly within a
few milliseconds; small percentage changes on sub-millisecond decode rows are
not meaningful.

| Fixture | New Rust total median (range) | Baseline | Change | New decode median (range) | Baseline | Change |
|---|---:|---:|---:|---:|---:|---:|
| `1343_rotate_90_cw.jpg` | 77.4 (75.0–85.6) | 76.8 | +0.8% | 40.0 (38.3–41.7) | 39.1 | +2.4% |
| `1718_rotate_90_cw.HEIC` | 516.2 (515.6–521.9) | 600.4 | **−14.0%** | 473.5 (471.8–473.8) | 555.8 | **−14.8%** |
| `7765_horizontal_normal.HEIC` | 624.3 (622.7–625.6) | 760.0 | **−17.9%** | 576.2 (574.1–579.2) | 715.3 | **−19.5%** |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 130.3 (126.3–130.5) | 145.4 | **−10.4%** | 84.8 (84.8–84.8) | 100.5 | **−15.6%** |
| `IMG_0682_pano.HEIC` | 665.5 (660.0–667.0) | 1,365.6 | **−51.3%** | 617.0 (613.3–620.4) | 1,316.4 | **−53.1%** |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 214.5 (208.8–215.5) | 380.8 | **−43.7%** | 166.9 (164.7–168.5) | 333.7 | **−50.0%** |
| `IMG_8905.CR2` | 129.7 (124.7–130.3) | 135.2 | −4.1% | 79.9 (79.2–80.1) | 85.6 | −6.7% |
| `IMG_pano.jpg` | 115.1 (110.3–116.0) | 107.9 | +6.7% | 69.6 (69.4–70.0) | 66.2 | +5.1% |
| `astronaut.png` | 40.0 (39.6–40.9) | 40.1 | −0.2% | 2.7 (2.4–3.2) | 2.6 | +2.4% |
| `man.jpeg` | 39.4 (37.9–42.9) | 37.7 | +4.4% | 0.3 (0.3–0.6) | 0.3 | +12.7% |
| `people.jpeg` | 56.0 (55.5–56.8) | 50.5 | +11.0% | 0.7 (0.6–0.7) | 0.4 | +62.5% |
| `singapore.jpg` | 47.6 (47.0–49.3) | 47.4 | +0.4% | 11.6 (11.1–12.9) | 11.1 | +4.3% |
| `starwatchers.jpg` | 42.3 (41.9–43.2) | 42.0 | +0.8% | 5.0 (4.5–5.3) | 4.5 | +10.4% |
| `ui_app.webp` | 78.2 (78.1–80.5) | 79.0 | −1.0% | 24.7 (24.6–26.8) | 25.1 | −1.8% |
| **HEIC total** | **2,150.9** | **3,252.2** | **−33.9%** | **1,918.4** | **3,021.6** | **−36.5%** |
| **Corpus total** | **2,776.7** | **3,868.8** | **−28.2%** | **2,152.7** | **3,256.4** | **−33.9%** |

The result strongly validates bounded grid parallelism: the two grid-heavy
fixtures account for most of the absolute saving and are roughly twice as fast
to decode. The 14.8–19.5% decode reductions on the two large ordinary HEICs,
plus 15.6% on the smaller transformed HEIC, show that direct RGB8 output and the
profile-guided NEON kernels also matter outside grids. This cumulative run does
not independently attribute those ordinary-file gains between RGB8 and NEON;
the decoder repository's sequential A/B notes provide that attribution.

The optimized pure-Rust path is now close to the ImageIO hybrid: its HEIC decode
sum is 71.5 ms (3.9%) slower and its full-corpus Rust total is 81.6 ms (3.0%)
slower in these sequential runs. It remains 293.1 ms slower than the
libheif/libde265 HEIC sum, but avoids that native dependency and license-review
surface. Decode still represents about 77.5% of the new corpus Rust total, so
there is useful headroom, but the four changes remove over one third of the
original HEIC decode cost without changing parity.

## ImageIO hybrid benchmark

The final ImageIO prototype uses full-resolution `CGImageSourceCreateImageAtIndex`, draws into an RGB buffer, and then applies the same explicit Rust orientation handling as the other paths. The earlier thumbnail-based prototype was discarded because it changed pixels/orientation and failed parity.

Full-resolution ImageIO preserves face and CLIP parity for every HEIC it can decode. It rejects `IMG_0682_pano.HEIC` and `IMG_8606...HEIC`; the benchmark below retries those with the current Rust decoder so every fixture completes.

| HEIC fixture | File size | Resolution | Rust total | Decode | Decode speedup | Path | Parity |
|---|---:|---:|---:|---:|---:|---|---|
| `1718_rotate_90_cw.HEIC` | 4.75 MiB | 3504×2439 | 157.8 | 114.0 | 4.88× | ImageIO | Pass |
| `7765_horizontal_normal.HEIC` | 4.67 MiB | 3250×4333 | 148.8 | 98.8 | 7.24× | ImageIO | Pass |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 0.63 MiB | 1547×1209 | 62.6 | 24.5 | 4.09× | ImageIO | Pass |
| `IMG_0682_pano.HEIC` | 7.52 MiB | 14604×3826 | 1,331.7 | 1,280.8 | 1.03× | Current fallback | Pass |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 1.34 MiB | 3024×4032 | 374.0 | 328.7 | 1.02× | Current fallback | Pass |
| **HEIC total** | — | — | **2,075.0** | **1,846.9** | **1.64×** | 3 ImageIO / 2 fallback | **5/5 pass** |

The fallback errors occur before meaningful decoding work (under 1 ms), so they do not materially inflate the two fallback rows. This hybrid reduces the full-corpus Rust total by 30.3%.

## `heic` crate benchmark

The [`heic` 0.1.6 crate](https://docs.rs/heic/latest/heic/) was built with its `parallel` feature, decoded directly to RGB8, and used the device's available parallelism. It completed every fixture and preserved parity.

| HEIC fixture | File size | Resolution | Rust total | Decode | Decode speedup | Parity |
|---|---:|---:|---:|---:|---:|---|
| `1718_rotate_90_cw.HEIC` | 4.75 MiB | 3504×2439 | 630.8 | 584.6 | 0.95× | Pass |
| `7765_horizontal_normal.HEIC` | 4.67 MiB | 3250×4333 | 702.0 | 654.0 | 1.09× | Pass |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 0.63 MiB | 1547×1209 | 140.5 | 95.3 | 1.05× | Pass |
| `IMG_0682_pano.HEIC` | 7.52 MiB | 14604×3826 | 463.5 | 416.7 | 3.16× | Pass |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 1.34 MiB | 3024×4032 | 169.8 | 124.9 | 2.67× | Pass |
| **HEIC total** | — | — | **2,106.5** | **1,875.5** | **1.61×** | **5/5 pass** |

This decoder is roughly even with the current implementation on the three ordinary HEICs, but dramatically better on the two grid/problem fixtures. It reduces the full-corpus Rust total by 29.7%. Its crate metadata declares `AGPL-3.0-only OR LicenseRef-Imazen-Commercial`, so it should not be adopted without an explicit licensing decision.

## `libheif-rs` benchmark

[`libheif-rs` 2.7.0](https://docs.rs/libheif-rs/latest/libheif_rs/) was benchmarked with a minimal release-built native libheif, libde265 1.0.16 as its HEVC codec, direct RGB output, and maximum decoding threads set to device parallelism. Every HEIC completed and preserved parity.

| HEIC fixture | File size | Resolution | Rust total | Decode | Decode speedup | Parity |
|---|---:|---:|---:|---:|---:|---|
| `1718_rotate_90_cw.HEIC` | 4.75 MiB | 3504×2439 | 473.3 | 427.5 | 1.30× | Pass |
| `7765_horizontal_normal.HEIC` | 4.67 MiB | 3250×4333 | 566.7 | 519.5 | 1.38× | Pass |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 0.63 MiB | 1547×1209 | 123.6 | 78.8 | 1.27× | Pass |
| `IMG_0682_pano.HEIC` | 7.52 MiB | 14604×3826 | 524.6 | 475.4 | 2.77× | Pass |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 1.34 MiB | 3024×4032 | 167.2 | 124.0 | 2.69× | Pass |
| **HEIC total** | — | — | **1,855.3** | **1,625.3** | **1.86×** | **5/5 pass** |

This is the fastest complete option and reduces the full-corpus Rust total by 35.6%. The cost is integration complexity: `libheif-rs` wraps a C++ native library, the HEVC codec is a separate native dependency, and the initial embedded build pulled in unnecessary codecs until it was configured as a minimal HEIC-decode-only archive. The [libheif project](https://github.com/strukturag/libheif) documents libde265 as its default HEIC decoder and supports parallel tile decoding.

## Correctness

The current, ImageIO-hybrid, `heic`, and `libheif-rs` runs all produced the same parity result:

- all five HEIC fixtures pass face and CLIP thresholds;
- all non-RAW fixtures pass;
- the sole failure is the pre-existing `IMG_8905.CR2` fallback, whose JPEG re-encode has CLIP cosine distance 0.196097 from the Python RAW ground truth.

The temporary decoder work did not change that CR2 path. The ImageIO-only run without fallback also confirmed that the three supported ImageIO HEICs pass before the hybrid was measured.

The cumulative `speed_improvements` release run has the same correctness
result: all five HEICs and all other non-RAW fixtures pass. The only finding is
the same pre-existing `IMG_8905.CR2` CLIP cosine distance of `0.196097`; there
are no new errors or HEIC threshold regressions.

## Recommendations

### 1. Prefer an ImageIO-first iOS path with the current decoder as fallback

This is the best practical first implementation for iOS. It removes 30.3% of measured corpus time, is 4.1–7.2× faster for supported HEICs, preserves parity, adds no decoder licensing burden, and keeps the unusual files on the already-tested Rust path. The fallback boundary is small and readable: one iOS-specific decoder returning the same `DecodedImage` type.

Before shipping, package the ImageIO bridge cleanly (preferably behind the image crate's decoder abstraction), add explicit tests for all EXIF orientations and the two fallback fixtures, and run a larger real-library sample to establish ImageIO's fallback rate. Do not use the thumbnail API; the full-image API plus explicit orientation is required for parity.

### 2. Keep `libheif-rs` as the performance-maximizing alternative

If the additional 202 ms per test corpus versus ImageIO hybrid is valuable, `libheif-rs` is the fastest complete option and handles every problematic fixture. A production integration should build a minimal release-only libheif + libde265 artifact, measure binary-size impact, document native update ownership, and complete an LGPL/static-linking compliance review. The wrapper's MIT license does not remove the native libraries' obligations.

The 7.5% corpus advantage over ImageIO hybrid is real in this run but modest relative to the added build and maintenance surface. It becomes more compelling if a larger photo sample shows frequent ImageIO fallback.

### 3. Do not adopt `heic` without resolving its license

Technically, `heic` is attractive: pure Rust integration, direct RGB8 output, full parity, and the best pano result. Its overall performance is essentially tied with ImageIO hybrid. Legally, the published AGPL/commercial license requires either a compatible product decision or a commercial license; it is not a drop-in dependency decision.

### 4. Use the problem-fixture results to guide the current decoder

Both alternative complete decoders improve the pano/text fixtures far more than the ordinary files. The highest-value work in the current `heic-decoder` is therefore grid/tile scheduling and direct RGB output, not generic container parsing. The `heic` result shows that parallel grid decode can cut the 55.9 MP pano from 1,316 ms to 417 ms while preserving embeddings.

### 5. Make release-mode enforcement part of future benchmarks

The debug/profile mismatch changed absolute decode times by about 10× and would have produced misleading prioritization. The runner should print and assert the actual iOS Flutter mode and Rust Cargo profile, and benchmark artifact paths should include both. Future decoder A/B runs should be uninstrumented, randomized by decoder or fixture, and repeated enough to report confidence intervals.

## Artifacts

- Current release: `infra/ml/test/out/rust_pipeline_ios_current_release_2026-07-16/`
- ImageIO full-image validation: `infra/ml/test/out/rust_pipeline_ios_imageio_full_release_2026-07-16/`
- ImageIO hybrid: `infra/ml/test/out/rust_pipeline_ios_imageio_hybrid_release_2026-07-16/`
- `heic` release: `infra/ml/test/out/rust_pipeline_ios_heic_crate_release_2026-07-16/`
- `libheif-rs` release: `infra/ml/test/out/rust_pipeline_ios_libheif_rs_release_2026-07-16/`
- Four cumulative decoder improvements, true Flutter/Rust release:
  `infra/ml/test/out/rust_pipeline_ios_speed_improvements_release_2026-07-16/`

The local path override, direct-RGB caller shim, timing instrumentation, and
standalone release runner were removed after the run. The four decoder changes
are committed on `speed_improvements`; the pre-existing experimental artifacts
described elsewhere in this report retain their original status.
