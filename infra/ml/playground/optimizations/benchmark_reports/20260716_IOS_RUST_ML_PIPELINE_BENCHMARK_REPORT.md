# iOS Rust ML indexing pipeline benchmark

Date: 2026-07-16  
Code revision: `7571009d6e` (`ort_opt_ios`) plus temporary, uncommitted timing instrumentation  
Device: iPhone 15 Pro (A17 Pro), iOS 26.5, wired device ID `00008130-00067DD02212001C`  
Build: Flutter profile mode with the Rust release library  
Workload: the 14 fixtures used by the Rust ML indexing parity test, faces + CLIP enabled, pets disabled

## Executive summary

Decoding is now overwhelmingly the bottleneck. For one representative pass over the corpus (the sum of the per-image medians), the Rust pipeline took 53.73 seconds, of which 50.83 seconds (94.6%) was image decoding. Preprocessing took 2.06 seconds (3.8%), warmed ONNX inference took 0.70 seconds (1.3%), and alignment plus postprocessing took 0.14 seconds (0.3%).

The largest single fixture, `IMG_0682_pano.HEIC`, spent 23.35 of 23.70 seconds decoding. Even on ordinary HEIC fixtures, decode was 5.7–7.2 seconds while the complete warmed face and CLIP inference work was about 50 milliseconds. Further postprocessing work cannot materially improve ordinary indexing latency; the next meaningful work should be in the decoder path, especially HEIC.

The temporary instrumentation did not change model outputs. The device parity run passed all face metrics for all fixtures and passed CLIP for 13 of 14 fixtures. The sole failure was the existing CR2 fallback path: Rust cannot decode the CR2 directly, Dart decodes and re-encodes it as JPEG, and that derived image has CLIP cosine distance 0.1961 from the Python RAW ground truth. This is a correctness limitation of the fallback, not a timing-related result.

## Method

The benchmark added `Instant` spans around:

- total Rust analysis and image decode;
- codec decode, ICC conversion, EXIF/container orientation, and conversion to RGB8;
- YOLO resize and tensor construction;
- face detection, each face alignment substage, each face embedding, and their postprocessing;
- CLIP resize, tensor construction, inference, and embedding normalization;
- equivalent pet stages (instrumented but not exercised because the canonical test has `run_pets = false`);
- lazy model session creation and every synchronous `Session::run` call.

All 14 fixtures and models were staged before measurement. The runner then performed one complete warm-up pass followed by five measured passes per image. Tables below use the median of those five passes. This avoids treating CoreML/ORT model compilation and the first inference as steady-state work. End-to-end Dart time is the five-run average reported by the parity runner; Rust stage time is the median, so small rounding differences are expected.

The logging itself uses synchronous `eprintln!`, so very short spans include some observer overhead. It does not affect the conclusion: the measured gaps are seconds of decode time versus tens of milliseconds elsewhere. Final optimization comparisons should use an uninstrumented A/B wall-clock run after attribution is complete.

## Results by image

Times are milliseconds. “Preprocess” combines YOLO and CLIP preprocessing. “Inference” combines face detection, all face embeddings, and CLIP image inference. The CR2 Rust total is the successful JPEG retry only; its Dart total also includes the failed Rust attempt and Dart decode/JPEG conversion.

| Fixture | End-to-end Dart | Rust total median (range) | Decode | Preprocess | Inference | Align + postprocess |
|---|---:|---:|---:|---:|---:|---:|
| `1343_rotate_90_cw.jpg` | 1,292 | 1,291.7 (1,282.8–1,298.3) | 1,082.9 | 160.3 | 49.5 | 0.2 |
| `1718_rotate_90_cw.HEIC` | 5,969 | 5,967.3 (5,932.6–6,007.3) | 5,737.6 | 170.6 | 52.6 | 4.7 |
| `7765_horizontal_normal.HEIC` | 7,566 | 7,534.0 (7,266.2–7,875.0) | 7,239.9 | 240.4 | 52.6 | 5.5 |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 1,418 | 1,412.9 (1,405.4–1,433.5) | 1,247.7 | 115.9 | 45.0 | 5.6 |
| `IMG_0682_pano.HEIC` | 23,615 | 23,695.0 (23,245.9–23,760.8) | 23,350.7 | 279.6 | 53.9 | 5.3 |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 6,144 | 6,126.3 (6,092.0–6,239.9) | 5,842.9 | 233.1 | 49.1 | 0.2 |
| `IMG_8905.CR2` | 5,803 | 3,496.7 (3,468.0–3,558.3) | 3,179.4 | 267.5 | 52.4 | 0.2 |
| `IMG_pano.jpg` | 1,916 | 1,905.7 (1,891.0–1,978.8) | 1,778.2 | 79.0 | 44.7 | 5.3 |
| `astronaut.png` | 164 | 164.3 (157.2–166.6) | 23.7 | 92.5 | 41.0 | 5.4 |
| `man.jpeg` | 122 | 122.1 (116.9–123.9) | 5.8 | 68.4 | 42.0 | 5.8 |
| `people.jpeg` | 191 | 178.6 (167.6–216.0) | 8.7 | 74.5 | 52.8 | 42.0 |
| `singapore.jpg` | 541 | 536.7 (507.1–595.2) | 385.0 | 111.2 | 40.2 | 0.3 |
| `starwatchers.jpg` | 211 | 208.6 (206.6–214.1) | 86.8 | 76.0 | 40.7 | 5.7 |
| `ui_app.webp` | 1,104 | 1,089.5 (1,068.0–1,153.5) | 863.2 | 92.8 | 86.8 | 50.1 |
| **Corpus total** | **56,056** | **53,729.5** | **50,832.5** | **2,061.8** | **703.4** | **136.3** |

The unassigned Rust overhead was only 2.2 ms across the summed medians. This confirms that the spans account for effectively the whole Rust call.

## Decode breakdown

Within the 50.84 seconds covered by the decode substages:

| Decode substage | Corpus time | Share of decode | Share of Rust total |
|---|---:|---:|---:|
| Codec/container decode | 48,118.4 ms | 94.7% | 89.6% |
| RGBA/dynamic image to RGB8 | 1,876.6 ms | 3.7% | 3.5% |
| Orientation | 839.5 ms | 1.7% | 1.6% |
| ICC conversion | 1.0 ms | ~0.0% | ~0.0% |

Notable decode medians:

- `IMG_0682_pano.HEIC`: 22,217 ms codec + 1,133 ms RGB8 conversion.
- `7765_horizontal_normal.HEIC`: 6,972 ms codec + 267 ms RGB8 conversion.
- `1718_rotate_90_cw.HEIC`: 5,217 ms codec + 369 ms orientation + 153 ms RGB8 conversion.
- `1343_rotate_90_cw.jpg`: 800 ms codec + 286 ms orientation.
- `ui_app.webp`: 820 ms codec + 43 ms RGB8 conversion.

The current HEIC integration decodes through `heic_decoder` into an RGBA8/RGBA16 `DynamicImage`; ML then converts the complete frame to RGB8. That explains the separately visible full-frame RGB conversion cost. ICC conversion is not a useful optimization target in this corpus.

## Preprocessing, inference, and postprocessing

For a typical image, YOLO resize was about 60 ms and YOLO tensor creation about 17 ms. CLIP resize was about 37 ms and tensor creation about 2.5 ms. Across the corpus, resize work accounts for roughly 1.80 of the 2.06 preprocessing seconds; tensor allocation/layout conversion is comparatively small.

After warm-up:

- face detection inference was generally 21–26 ms per image;
- CLIP image inference was generally 18–32 ms per image;
- face embedding inference was roughly 1.4–1.9 ms per face, with higher aggregate time on face-heavy images;
- face detection and CLIP postprocessing were effectively free at this scale;
- face alignment was about 5 ms per face. It became visible only for `people.jpeg` (7 faces) and `ui_app.webp` (10 faces).

This validates the recently implemented borrowed-output and detection postprocessing changes: postprocessing is no longer a consequential whole-corpus cost. Face-heavy images still pay linearly for alignment and embedding, as expected.

## Cold start

The first warm-up image took 8.97 seconds. Excluding its 1.04-second decode and 0.10-second YOLO preprocessing, the important cold costs were:

| Operation | Session creation | First inference | Warmed inference |
|---|---:|---:|---:|
| Face detection | 546 ms | 1,292 ms | 21–26 ms |
| CLIP image | 3,831 ms | 2,091 ms | 18–32 ms |
| Face embedding | 172 ms | 959 ms | 1.4–1.9 ms/face |

These costs matter to perceived first-index latency, but they are ORT/CoreML initialization costs and are intentionally outside the Rust-side recommendations below.

## Correctness

The parity comparison checked 14 files and 16 detected faces:

- face boxes: pass, maximum IoU error 0;
- landmarks: pass, maximum error 0.001165 against a 0.03 threshold;
- face embeddings: pass, maximum cosine distance 0.009906 against a 0.015 threshold;
- scores: pass, maximum delta 0.003269 against a 0.05 threshold;
- CLIP: 13/14 files pass; `IMG_8905.CR2` fails at cosine distance 0.196097.

Rust unit tests also passed (`cargo test -p ente-photos --lib`: 52 passed).

## Recommendations

### 1. Prioritize an iOS-native or substantially faster HEIC decode path

This is the only change with order-of-magnitude upside. Benchmark a full-resolution Apple ImageIO/ImageIO-backed decode against the current pure-Rust HEIC path, or optimize the `heic_decoder` codec itself (including independent grid/tile decode where applicable). Keep color-space handling and orientation explicit rather than relying on UIKit defaults.

Accuracy must be the gate: compare oriented RGB buffers first, then run the complete 14-image parity suite. If native decode produces material pixel or embedding differences, do not ship it merely for speed. Even a large decoder implementation is justified only behind a clean `DecodedImage` abstraction so the indexing code remains readable.

### 2. Add a direct RGB8 output path to `heic_decoder`

HEIC currently produces full-frame RGBA and ML immediately allocates/copies a second full frame to discard alpha. A decoder API that writes the same RGB values directly into the final RGB8 buffer can recover up to 1.88 seconds across this corpus (3.5% of Rust time), including about 1.13 seconds on the panoramic HEIC alone. For images with alpha, preserve the current exact “drop alpha” semantics.

This is lower risk than changing decode resolution or using embedded thumbnails because it can be made byte-for-byte equivalent.

### 3. Fuse or eliminate full-frame orientation copies

Orientation costs 0.84 seconds across the corpus and 182–369 ms on the rotated HEICs. The best exact approach is to have the decoder write RGB8 in final orientation in one pass. A second option is an oriented pixel view used by preprocessing and alignment, avoiding a physical rotation while keeping coordinate conversion in one well-tested abstraction.

Add byte-equivalence tests for all eight EXIF orientations. This is worth doing after direct RGB output because the two transformations can naturally be fused.

### 4. Prototype concurrent YOLO and CLIP preprocessing, but treat it as secondary

The two resize/tensor pipelines are independent reads of the decoded image. Running them concurrently has a measured theoretical ceiling of only 786 ms across the corpus (1.46% of total Rust time), before thread scheduling and memory-bandwidth contention. It may help small JPEG/PNG images more than HEIC-heavy workloads.

Use scoped, bounded concurrency and benchmark on device; do not add a global thread pool or obscure ownership merely for this small ceiling. Running complete face and CLIP inference pipelines concurrently may have a larger wall-clock effect, but should be evaluated separately because CoreML/ORT contention could erase the gain.

### 5. Reuse preprocessing scratch allocations only after the decode work

YOLO tensor construction totals about 219 ms and CLIP tensor construction about 34 ms across the corpus. Reusing `Resizer`, resized-image buffers, and tensor buffers can reduce allocations, but the total possible gain is under 0.5% here and complicates ownership because tensors are retained through inference. It is a cleanup optimization, not the next project.

### 6. Fix the CR2 path for correctness first, then performance

CR2 currently incurs a failed Rust decode followed by Dart `package:image` decode, JPEG quality-95 re-encoding, a temporary file write, and a second Rust decode. That adds about 2.3 seconds outside the successful Rust call and is the only parity failure. A native Rust RAW/CR2 implementation or a shared canonical preview extraction could avoid the round trip, but it must first define which pixels are authoritative. Removing the temporary file alone will not address the expensive decode/re-encode or the accuracy mismatch.

## Changes not recommended now

- More face/CLIP detection postprocessing optimization: measured at only a few milliseconds for the entire corpus.
- ICC optimization: approximately 1 ms for the corpus.
- Embedded-thumbnail or reduced-resolution decode without a strict parity experiment: likely fast, but it can alter detections and embeddings and therefore violates the accuracy requirement by default.
- Broad unsafe/SIMD rewrites of tensor loops: the measured ceiling is too small relative to readability and maintenance cost.

## Artifacts

- Raw combined device log: `infra/ml/test/out/rust_pipeline_ios_2026-07-16/device_benchmark.log`
- iOS results: `infra/ml/test/out/rust_pipeline_ios_2026-07-16/ios/results.json`
- Machine-readable comparison: `infra/ml/test/out/rust_pipeline_ios_2026-07-16/comparison_report.json`
- HTML parity report: `infra/ml/test/out/rust_pipeline_ios_2026-07-16/parity_report.html`

All timing instrumentation and benchmark-runner changes remain uncommitted and are intentionally temporary.
