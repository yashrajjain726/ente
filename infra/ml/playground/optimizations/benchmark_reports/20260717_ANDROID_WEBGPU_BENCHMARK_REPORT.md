# Android WebGPU Release Smoke Test and Benchmark

- **Date:** 17 July 2026
- **Device:** Pixel 8 (`shiba`), Google Tensor G3, Mali-G715, Android 17 / API 37
- **Base revision:** `6a74a6aba6`, plus temporary benchmark-only instrumentation
- **Build:** Flutter AOT release and release-mode Rust, `independent` flavor
- **ONNX Runtime:** custom 1.27.0 Android AAR, release `ort-1.27.0-webgpu-pilot.5`
- **WebGPU configuration:** forced `true` in the parity runner for this investigation
- **Raw evidence:** [`infra/ml/test/out/android_webgpu_release_2026-07-17/`](../../../test/out/android_webgpu_release_2026-07-17/)
- **Machine-readable summary:** [`benchmark_summary.json`](../../../test/out/android_webgpu_release_2026-07-17/benchmark_summary.json)

## Outcome

The custom ONNX Runtime build works in a real, non-debuggable release APK, and
the indexing models genuinely execute through Dawn's Vulkan WebGPU backend on
the Pixel 8's Mali-G715. This is not inferred merely from app-level Vulkan
activity: ONNX Runtime's own execution-plan logs assigned YOLO and MobileCLIP
entirely to `WebGpuExecutionProvider`, and assigned MobileFaceNet to a
WebGPU/CPU split.

The full 14-fixture corpus completed without a crash or ML error. The run
performed one warm-up and five measured passes per fixture: 84 completed image
pipelines, 70 measured pipelines, 70 YOLO inferences, 70 MobileCLIP inferences,
and 125 measured MobileFaceNet inferences for the corpus's 25 faces per pass.

The steady pure-inference result is mixed:

| Model | WebGPU `session.run` p50 | Historical XNNPACK4 p50 | Directional change |
|---|---:|---:|---:|
| YOLO face detector B1 | 107.6 ms | 204.4 ms | **47.3% lower latency** |
| MobileCLIP B1 | 139.0 ms | 301.6 ms | **53.9% lower latency** |
| MobileFaceNet B1, per face | 99.5 ms | 19.4 ms | **5.13x slower** |

Despite the MobileFaceNet regression, the observed 25-face corpus needs about
5.862 seconds of pure WebGPU-policy inference per steady pass, versus
7.499–7.631 seconds in the earlier XNNPACK4 runs. That is a directional
21.8–23.2% reduction for this exact corpus. It is not a controlled
apples-to-apples percentage because the earlier run used Android 16 and a
Flutter profile shell, while both runs used release Rust.

The recommended production experiment is therefore **model-specific**, not a
uniform WebGPU policy:

- Use WebGPU for YOLO and MobileCLIP on supported Android devices.
- Keep MobileFaceNet on direct CPU or XNNPACK unless a graph change removes the
  WebGPU/CPU partition and its transfer/dispatch overhead. The previous Pixel 8
  benchmark found direct CPU fastest for this model.
- Retain XNNPACK and CPU as session-creation fallbacks.
- Validate the hybrid policy in the same release APK on more Android GPUs
  before enabling it broadly.

## What was tested

The existing ML parity manifest was used without dropping difficult formats:

- 14/14 fixtures: JPEG, PNG, WebP, HEIC, panoramic images, rotations/mirroring,
  and the CR2 RAW fixture.
- Face detection, face alignment, face embedding, and MobileCLIP image
  embedding were enabled.
- Pet indexing was not part of this parity manifest and remained disabled.
- Each fixture was downloaded or resolved before its timed loop.
- Each fixture received one unmeasured warm-up followed by five measured
  `_analyzeImage` calls.

The benchmark used four nested timing levels:

1. Dart end-to-end `_analyzeImage` time, including FFI/isolate scheduling and
   the CR2 fallback behavior.
2. Rust pipeline stages: runtime entry, decode, YOLO preprocessing, face
   detection, face alignment, face embedding, MobileCLIP, all pet-stage slots,
   and unaccounted time.
3. Exact ONNX calls: input tensor construction, synchronous `session.run`, and
   output access/copy for every model invocation.
4. Session construction and provider-fallback attempts.

Timers use microsecond-resolution Dart clocks and Rust `Instant` nanoseconds.
The Android log emission happens after the inference timer is stopped. ORT
execution-plan verbosity emitted messages during session construction, but no
plan messages during the measured inference loops.

## Release-mode proof

The normal Flutter Driver command intentionally refuses Android `--release`,
so the parity test entrypoint was built directly as an installable release APK
and launched through its explicit activity. This preserves the test logic
without silently falling back to profile mode.

| Check | Evidence |
|---|---|
| Flutter mode | Benchmark asserts `dart.vm.product == true` and `dart.vm.profile == false` before doing any work; the complete results file was produced. |
| Android manifest | `apkanalyzer manifest debuggable` returned `false`. |
| Installed package | `dumpsys package` flags were `[ HAS_CODE ALLOW_CLEAR_USER_DATA LARGE_HEAP ]`, with no `DEBUGGABLE` flag. |
| Rust mode | Cargokit built and packaged `aarch64-linux-android/release/libente_photos_rust.so`. |
| Package | `io.ente.photos.independent`, version `1.3.59` (`2158`), target SDK 36. |
| APK | `app-independent-release.apk`, 243,248,701 bytes, SHA-256 `58b93b4a488a6c452f57193090c6a762ee69312525b7f41ac93cd0a5efc0d772`. |

The APK was signed with the local Android debug certificate solely to permit
installation on the attached device. Certificate choice does not change the
release/AOT build mode; the installed manifest remained non-debuggable.

The packaged arm64 libraries included `libapp.so`, release
`libente_photos_rust.so`, and the custom `libonnxruntime.so`. The custom AAR's
SHA-256 was
`f40ef31bb6ff8399c556872bcad272bddb650b0845f3026c56a065de9b1ec579`,
matching `mobile/native/onnxruntime/version.properties`. Its native library
contains WebGPU EP, Dawn, Vulkan, and XNNPACK symbols.

## Proof that ONNX Runtime used the GPU

The attached device reported:

| Property | Value |
|---|---|
| Model / device | Pixel 8 / `shiba` |
| SoC | Google Tensor G3 |
| Vulkan hardware property | `mali` |
| Vulkan physical device | `Mali-G715` |
| Vulkan device type | Integrated GPU (`VkPhysicalDeviceType` value 1) |
| Vulkan vendor ID | 5045 (`0x13B5`, Arm) |
| Android GPU accounting | `io.ente.photos.independent` had a Vulkan device; `cpuVulkanInUse=0` |

The ML-specific evidence is stronger than those system properties:

1. The runner logged `requested=true sdk_supported=true allowed=true`.
2. Every first session attempt used `webgpu+xnnpack+cpu` and succeeded; no
   XNNPACK-only or CPU-only fallback attempt occurred.
3. The ORT session options recorded WebGPU's Dawn backend as `Vulkan` and
   preferred layout as `NCHW`.
4. Dawn initialized and emitted its Mali capability-limit warnings.
5. ORT's optimized execution plans reported the following placement:

| Model | WebGPU nodes | CPU nodes | Placement result |
|---|---:|---:|---|
| Static YOLO | 277 | 0 | All nodes on WebGPU |
| MobileCLIP | 660 | 0 | All nodes on WebGPU |
| Static MobileFaceNet | 132 | 33 | Split WebGPU/CPU graph |

This confirms WebGPU compute on the Mali GPU. Flutter also used Vulkan for
Impeller, but the ORT node-assignment records distinguish ML GPU execution from
rendering activity.

## Session construction

These are process-cold sessions with already-downloaded model files. All three
primary WebGPU attempts succeeded.

| Model | Provider chain | Session construction |
|---|---|---:|
| YOLO | WebGPU -> XNNPACK4 -> CPU | 239.7 ms |
| MobileCLIP | WebGPU -> XNNPACK4 -> CPU | 389.3 ms |
| MobileFaceNet | WebGPU -> XNNPACK4 -> CPU | 71.4 ms |
| **Total** | | **700.4 ms** |

These times include ORT graph optimization and Dawn pipeline/session setup.
They do not include model download. No failed session attempt was observed.

## Pure inference

`session.run` is the synchronous ORT call only. “Total inference timer” adds
input tensor creation and output extraction/copy, but still excludes image
decode, resize/preprocessing, detector postprocessing, face alignment, and
embedding normalization.

| Model | Calls | First `session.run` | Steady p50 | p90 | p95 | Range |
|---|---:|---:|---:|---:|---:|---:|
| YOLO | 70 | 517.4 ms | 107.6 ms | 112.5 ms | 113.2 ms | 103.3–120.4 ms |
| MobileCLIP | 70 | 503.1 ms | 139.0 ms | 145.3 ms | 149.2 ms | 129.2–151.2 ms |
| MobileFaceNet B1 | 125 | 143.2 ms | 99.5 ms | 110.6 ms | 112.7 ms | 49.4–123.5 ms |

The first-call values show expected WebGPU shader/pipeline warm-up. They come
from the first fixture warm-up and are excluded from all steady percentiles.
The MobileFaceNet range is bimodal/noisy compared with the fully GPU-placed
models, consistent with its 132-WebGPU/33-CPU partition.

Tensor wrapping and output extraction are not the explanation for the model
latencies:

| Model | Input p50 | Output p50 | Total inference-timer p50 |
|---|---:|---:|---:|
| YOLO | 0.037 ms | 0.756 ms | 108.7 ms |
| MobileCLIP | 0.031 ms | 0.007 ms | 139.0 ms |
| MobileFaceNet | 0.018 ms | 0.007 ms | 99.5 ms |

Across one 14-image steady corpus pass, pure `session.run` time averages:

| Model | Calls per corpus | Pure inference per corpus |
|---|---:|---:|
| YOLO | 14 | 1.514 s |
| MobileCLIP | 14 | 1.945 s |
| MobileFaceNet | 25 | 2.403 s |
| **Total** | **53** | **5.862 s** |

MobileFaceNet therefore accounts for about 41% of pure model inference on this
corpus even though each input is only 112x112. A hybrid provider policy has a
larger opportunity than further tuning fully GPU-placed YOLO or MobileCLIP.

## End-to-end pipeline timing

The five complete Dart corpus rounds were 17.565, 17.438, 17.332, 17.722, and
17.654 seconds; their p50 is **17.565 seconds**. These timings exclude fixture
download but include the complete `_analyzeImage` boundary and CR2's failed
native-decode attempt plus JPEG fallback.

The Rust successful-pipeline rounds were 11.735, 11.854, 11.784, 12.029, and
11.834 seconds, p50 **11.834 seconds**. The difference is dominated by
`IMG_8905.CR2`: Dart measures about 5.968 seconds, while the successful JPEG
fallback pipeline is about 0.494 seconds. The first native CR2 attempt exits
before a successful Rust `pipeline_end`, but remains included in the Dart
end-to-end number. Without CR2, the five Dart corpus rounds are
11.469–11.754 seconds.

Summed across the 70 measured successful Rust pipelines, the work divided as
follows:

| Stage | Five-pass total | Average per corpus | Share of pipeline |
|---|---:|---:|---:|
| Decode | 26.521 s | 5.304 s | 44.77% |
| YOLO preprocessing | 1.518 s | 0.304 s | 2.56% |
| Face detection, including postprocessing | 7.645 s | 1.529 s | 12.91% |
| Face alignment | 0.723 s | 0.145 s | 1.22% |
| Face embedding, 25 B1 calls per corpus | 12.038 s | 2.408 s | 20.32% |
| MobileCLIP, including preprocessing | 10.781 s | 2.156 s | 18.20% |
| Runtime entry + unaccounted | 0.009 s | 0.002 s | 0.01% |
| **Total** | **59.236 s** | **11.847 s** | **100%** |

Decode is the largest end-to-end cost on the mixed-format corpus. Within ML,
MobileFaceNet is now the dominant optimization target because WebGPU has
already cut the two large, fully GPU-placed models substantially.

### Per-fixture steady medians

The Dart total is the most complete latency. Rust stage medians cover the
successful image pipeline and make the bottleneck visible.

| Fixture | Faces | Dart total | Decode | Detection | Face embedding | CLIP |
|---|---:|---:|---:|---:|---:|---:|
| `1343_rotate_90_cw.jpg` | 0 | 434.0 ms | 129.0 ms | 109.1 ms | — | 152.1 ms |
| `1718_rotate_90_cw.HEIC` | 1 | 1,203.0 ms | 829.3 ms | 113.3 ms | 63.5 ms | 156.6 ms |
| `7765_horizontal_normal.HEIC` | 1 | 1,440.3 ms | 1,029.9 ms | 109.3 ms | 86.4 ms | 163.3 ms |
| `7949_mirror_horizontal_rotate_270_cw.HEIC` | 1 | 563.0 ms | 186.3 ms | 108.0 ms | 81.2 ms | 147.7 ms |
| `IMG_0682_pano.HEIC` | 1 | 2,464.7 ms | 2,052.8 ms | 110.3 ms | 74.9 ms | 164.4 ms |
| `IMG_8606_rotate_90_cw_contains_text.HEIC` | 0 | 845.1 ms | 535.7 ms | 108.4 ms | — | 160.4 ms |
| `IMG_8905.CR2` | 0 | 5,968.0 ms | 193.2 ms[^cr2] | 109.9 ms | — | 160.0 ms |
| `IMG_pano.jpg` | 1 | 531.8 ms | 153.4 ms | 107.9 ms | 82.1 ms | 149.7 ms |
| `astronaut.png` | 1 | 420.0 ms | 14.7 ms | 107.8 ms | 106.8 ms | 147.1 ms |
| `man.jpeg` | 1 | 397.6 ms | 1.5 ms | 109.3 ms | 98.9 ms | 146.9 ms |
| `people.jpeg` | 7 | 1,063.9 ms | 1.5 ms | 107.0 ms | 721.9 ms | 155.1 ms |
| `singapore.jpg` | 0 | 330.9 ms | 44.8 ms | 109.6 ms | — | 145.2 ms |
| `starwatchers.jpg` | 1 | 432.6 ms | 23.5 ms | 106.5 ms | 106.6 ms | 150.1 ms |
| `ui_app.webp` | 10 | 1,457.5 ms | 89.1 ms | 107.4 ms | 998.7 ms | 159.0 ms |

[^cr2]: This is the successful fallback JPEG decode only. The Dart total also
    includes the failed first CR2-native path and fallback preparation.

## Correctness and smoke-test result

The app produced 14 CLIP embeddings and 25 face records per corpus, wrote its
complete result document, remained alive after the run, and logged no fatal
exception, native signal, out-of-memory error, or failed ONNX session.

Against the Python golden output, 13/14 fixtures passed. The single failure was
the pre-existing `IMG_8905.CR2` MobileCLIP decode difference:

| Metric | Worst observed | Threshold | Result |
|---|---:|---:|---|
| CLIP cosine distance | 0.196097 on CR2 | 0.015 | Known CR2 failure |
| Face-embedding cosine distance | 0.0099168 | 0.015 | Pass |
| Face-box IoU error | 0 | 0 | Pass |
| Landmark error | 0.001165 | 0.03 | Pass |
| Detection-score delta | 0.003269 | 0.05 | Pass |

A direct comparison against the previous Pixel 8 XNNPACK4 Android results is
more diagnostic for the provider change: **14/14 fixtures passed**. Maximum
differences were `1.888e-7` CLIP cosine distance, `6.912e-7` face-embedding
cosine distance, `9.222e-8` landmark delta, and `4.172e-7` score delta, with
identical face boxes. WebGPU therefore preserves the Android-visible outputs
to far tighter tolerances than the Python comparison requires.

## Memory and thermal observations

Immediately after the suite, the still-running process reported 648,832 KiB
PSS and 752,804 KiB RSS. Android attributed 513,292 KiB PSS to graphics
tracking (`GL mtrack` plus `EGL mtrack`). These are post-run whole-process
values, not peak memory or incremental WebGPU cost; they include Flutter,
decoded images, three model sessions, ORT, Dawn, and cached allocations.

The system thermal status remained `0`/none. The G3D sensor rose from about
33 C before the run to 63 C immediately after it, still with sensor status 0.
There was no thermal-throttling status transition. The phone was attached over
USB, so this run is suitable for latency and functional validation, not an
energy-efficiency claim.

## Recommendation

The custom AAR and WebGPU integration are technically ready for a broader
pilot: release loading, Dawn/Vulkan initialization, GPU node placement,
fallback configuration, full-corpus stability, and output parity all work on
the Pixel 8.

Do not enable WebGPU uniformly for every indexing model yet. The best next
configuration to benchmark is:

| Model | Proposed provider policy |
|---|---|
| YOLO | WebGPU -> XNNPACK4 -> CPU |
| MobileCLIP | WebGPU -> XNNPACK4 -> CPU |
| MobileFaceNet | CPU directly, or XNNPACK4 -> CPU |

Then repeat the same release corpus run on at least one Qualcomm/Adreno device,
one older supported Android device, and a low-memory device. Provider
availability and Dawn/Vulkan behavior are GPU-driver-specific, so the runtime
contract should remain “try WebGPU with explicit fallback,” not “all Android
devices use GPU.”

Before rollout, add lightweight production telemetry for provider/session
success, per-model first and steady inference, fallback selection, and device
GPU/driver identity. Do not keep verbose ORT graph-placement logging enabled in
production.

## Limitations

- This is one Pixel 8 on Android 17. The historical XNNPACK comparison used the
  same physical device on Android 16, not a same-run release control.
- The device and model files were warm from fixture/model preparation, while
  the installed process and its three ORT sessions were cold.
- The benchmark output deliberately stores five timing samples per fixture;
  the existing parity schema only accepts scalar timing fields. The raw output
  was preserved, and `results_for_comparison.json` removes only those arrays
  for the unmodified correctness comparator.
- Pet models were not enabled by the current 14-fixture parity workload.
- The CR2 failed native-decode attempt is covered by the Dart total but exits
  before the Rust successful-pipeline summary; its fallback pipeline is fully
  instrumented.
- Post-run memory is not peak memory, and USB-attached thermal observations are
  not energy measurements.

## Raw artifact map

The evidence is kept under the gitignored
`infra/ml/test/out/android_webgpu_release_2026-07-17/` tree:

- `android/results.json`: raw 14-fixture output with all five Dart timing
  samples per fixture.
- `android/results_for_comparison.json`: schema-compatible copy used only by
  the parity comparator.
- `logs/final_device_logcat.txt`: provider attempts, ORT placement, exact
  inference timings, pipeline stages, Dawn initialization, and smoke-test log.
- `benchmark_summary.json`: parsed timing distributions, corpus rounds, stage
  totals, and per-fixture medians.
- `analyze_benchmark.rb`: reproducible parser used to create the summary.
- `comparison_report.json`: WebGPU versus Python correctness report.
- `webgpu_vs_xnnpack4_report.json`: direct WebGPU versus historical XNNPACK4
  Android result comparison.
- `python/`: generated Python goldens for the exact fixture manifest and model
  hashes.

The forced WebGPU flag and all benchmark-only Dart/Rust instrumentation were
removed after collecting and validating these artifacts. No production
provider-selection behavior was changed as part of this benchmark report.
