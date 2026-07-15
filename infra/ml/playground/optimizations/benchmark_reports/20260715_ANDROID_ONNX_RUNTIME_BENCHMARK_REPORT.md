# Android ONNX Runtime Execution Provider Benchmark

- **Date:** 15 July 2026
- **Device:** Pixel 8 (`shiba`), Google Tensor G3, Android 16 / API 36
- **Build:** Flutter profile build with release-mode Rust
- **ONNX Runtime:** 1.27.0, `ort` revision `31c8f1443b`
- **Models:** the final iOS-optimized ONNX models plus unchanged MobileCLIP
- **Raw evidence:** [`infra/ml/test/out/android_ort_benchmark_2026-07-15/`](../../../test/out/android_ort_benchmark_2026-07-15/)
- **Machine-readable focused summaries:** [`focused_strategy_summary.csv`](../../../test/out/android_ort_benchmark_2026-07-15/focused_strategy_summary.csv) and [`focused_strategy_summary.json`](../../../test/out/android_ort_benchmark_2026-07-15/focused_strategy_summary.json)

## Outcome

On this Pixel 8, changing the Android provider chain from the current
`NNAPI -> XNNPACK -> CPU` strategy to `XNNPACK (4 threads) -> CPU` preserves
the application-visible results and reduces the measured model-loading plus
inference workload by approximately **36%** against the exact production
configuration. A deliberately conservative controlled comparison, in which
spinning was also disabled for the current strategy's final CPU session, still
improved by approximately **31%**.

The result is not uniform across the three models:

| Model | Current steady p50 | XNNPACK4 steady p50 | Change |
|---|---:|---:|---:|
| YOLO face detector B1 | 350.6 ms | 204.4 ms | **41.7% faster** |
| MobileCLIP B1 | 428.5 ms | 301.6 ms | **29.6% faster** |
| MobileFaceNet B1 | 13.8 ms | 19.4 ms | **40.3% slower** |

For a single simple Android policy, `XNNPACK4 -> CPU` is the better choice on
the Pixel 8 because YOLO and MobileCLIP dominate total inference time. For the
lowest possible latency, use XNNPACK4 for YOLO and MobileCLIP but use the CPU EP
directly for MobileFaceNet. The latter avoids both XNNPACK's MobileFaceNet
regression and the current strategy's failed NNAPI setup attempts.

## Scope

The focused decision compares only:

1. Current: `NNAPI(disable_cpu=true) -> XNNPACK -> CPU`.
2. Candidate: `XNNPACK(intra_op_num_threads=4) -> CPU`, with ORT intra-op
   threads fixed at one and intra-op spinning disabled as recommended for the
   XNNPACK provider.

QNN, WebGPU, and other providers were deliberately excluded. QNN would not be
applicable to the Google Tensor G3 in any case.

The candidate's four-thread setting was selected from the completed XNNPACK
thread sweep. Four threads was the best balanced point: larger pools improved
YOLO slightly but regressed MobileCLIP and MobileFaceNet.

## Models under test

| Model | Path | SHA-256 | Input |
|---|---|---|---|
| YOLO face detector | `infra/ml/playground/optimizations/models/yolov5s_face_640_640_static_b1.onnx` | `e047647409403d52696035ecd445792173e50d7fbdcccac97b958a585db9aa3d` | `[1,3,640,640]` |
| MobileFaceNet | `infra/ml/playground/optimizations/models/mobilefacenet_prelu_static_b1.onnx` | `f525daf3089ec41c938a66c47cd8278c2a443f31ee2bd2dac987db531c58ccfd` | `[1,112,112,3]` |
| MobileCLIP | existing `mobileclip_s2_image.onnx` | `ef54ec66c687603eb4dd303e20d9b67e81069d3133b1c69a70028c76718b7752` | `[1,3,256,256]` |

The optimized models are therefore the exact proposed cross-platform CDN
artifacts, not the old dynamic YOLO and MobileFaceNet exports.

## Why the current chain does not behave as intended

The Pixel advertises its Google Edge TPU to NNAPI as `google-edgetpu`. During
session creation, that driver rejected all three models with:

> The model cannot run using the current set of target devices, [Name: [google-edgetpu], Type [4]]

This is a session-creation failure, rather than unsupported nodes being handed
to the next EP inside a successfully created session. The current fallback
logic tries these session configurations:

1. `NNAPI -> XNNPACK -> CPU`
2. `NNAPI -> CPU`
3. `CPU`

Consequently, an NNAPI compilation failure prevents XNNPACK from ever getting
a standalone attempt. The session eventually succeeds as CPU-only. Merely
placing XNNPACK after NNAPI does not provide the intended fallback for this
failure mode.

This behavior is also why the candidate improves model loading: it avoids two
failed NNAPI compilation attempts before constructing a usable session.

## Pure inference results

Timers surround synchronous ONNX Runtime tensor creation, `session.run`, and
output extraction/copy. Image decode, resize, preprocessing, detector
postprocessing, face alignment, and embedding normalization are excluded.
Steady values exclude the first call. Current values are from the exact
production configuration in `current_perf`; XNNPACK values pool the two valid
controlled repeats. The additional `current_controlled` run disabled intra-op
spinning for the final CPU fallback and was slightly faster than production,
so it is retained as a conservative corroboration rather than the primary
baseline.

| Model | Strategy | First B1 | Steady p50 | Steady p90 |
|---|---|---:|---:|---:|
| YOLO | Current | 358.0 ms | 350.6 ms | 385.7 ms |
| YOLO | XNNPACK4 | 168.1–231.2 ms | 204.4 ms | 231.9 ms |
| MobileCLIP | Current | 426.1 ms | 428.5 ms | 437.1 ms |
| MobileCLIP | XNNPACK4 | 263.5–289.2 ms | 301.6 ms | 341.4 ms |
| MobileFaceNet B1 | Current | 28.9 ms | 13.8 ms | 20.7 ms |
| MobileFaceNet B1 | XNNPACK4 | 14.9–15.4 ms | 19.4 ms | 23.3 ms |

Static MobileFaceNet B1 executes once per face. The multi-face measurements
therefore show the same regression accumulating across calls:

| Logical request | Current | XNNPACK4 | Change |
|---|---:|---:|---:|
| Seven faces | 98.2 ms | 127.6 ms average | 29.9% slower |
| Ten faces | 118.1 ms | 168.4 ms average | 42.6% slower |

Across the full fixture suite, summing only instrumented model inference gives
11.316 seconds for the exact current strategy and 7.631/7.499 seconds for the
two XNNPACK4 repeats.

## Session creation

“Load wall” is the application's complete lazy model-load time. For the current
strategy it includes the failed NNAPI attempts; “successful attempt” is only
the final CPU session construction.

| Model | Current load wall | Current final CPU attempt | XNNPACK4 load wall |
|---|---:|---:|---:|
| YOLO | 428.4 ms | 58.8 ms | 183.3–209.7 ms |
| MobileCLIP | 1,072.7 ms | 250.7 ms | 448.1–454.7 ms |
| MobileFaceNet | 82.5 ms | 11.5 ms | 25.5–29.5 ms |
| **Total** | **1,583.6 ms** | — | **660.9–689.9 ms** |

Adding load wall and all instrumented inference, the complete measured ML work
is 12.899 seconds for the exact current configuration versus 8.292 and 8.189
seconds for XNNPACK4—a 35.7–36.5% reduction. The conservative
`current_controlled` comparison is 11.961 seconds and therefore still shows a
30.7–31.5% reduction.

The Flutter suite's coarse whole-image clock is not suitable for attributing EP
performance because it includes decoding, I/O, preprocessing, postprocessing,
isolate work, and scheduling. The focused conclusion therefore uses the
instrumented load and inference timers.

## Correctness

Both strategies produced 13/14 Python-golden passes. In both cases, the only
failure was the known MobileCLIP difference for `IMG_8905.CR2`, with a cosine
distance of approximately 0.196 against Python. This is the existing Android
RAW decode difference and is independent of the execution-provider strategy.

All face detection and embedding checks passed against Python:

- Maximum face-embedding cosine distance: current `0.0099064`, XNNPACK4
  `0.0099149`, both below the `0.015` threshold.
- Boxes, landmarks, scores, and face counts passed their existing thresholds.

A direct current-versus-XNNPACK4 Android comparison is much tighter:

| Metric | Maximum difference |
|---|---:|
| Face count | Exactly equal; 25 faces total |
| CLIP cosine distance | `2.990e-11` |
| Face-embedding cosine distance | `1.454e-6` |
| Bounding-box absolute delta | `3.576e-7` |
| Landmark absolute delta | `1.192e-7` |
| Detection-score absolute delta | `8.345e-7` |

The two controlled XNNPACK4 repeats were effectively identical to each other:
boxes, landmarks, and scores matched exactly, while embedding cosine distance
was at most `2.22e-16`.

## Recommendation

For a uniform, simple Android configuration, switch the three indexing models
to `XNNPACK4 -> CPU`. It is output-equivalent for application purposes and cuts
the dominant YOLO and MobileCLIP latency enough to reduce total measured ML
work by about 36%, despite MobileFaceNet becoming slower.

For the fastest model-specific configuration:

- YOLO: `XNNPACK4 -> CPU`.
- MobileCLIP: `XNNPACK4 -> CPU`.
- MobileFaceNet B1: direct CPU EP with one ORT intra-op thread.

Whichever policy is selected, fix the fallback sequence. If NNAPI remains in
front, a failed NNAPI session must be followed by an explicit
`XNNPACK -> CPU` session attempt before CPU-only. The current
`NNAPI+XNNPACK+CPU -> NNAPI+CPU -> CPU` sequence silently skips the useful
XNNPACK fallback observed in this benchmark.

The result is device-specific. NNAPI was deprecated in Android 15, and Google
notes that accelerator behavior is device-dependent. Keep CPU fallback and
validate on additional supported Android chipsets before turning this Pixel 8
result into a universal Android policy. See the official
[NNAPI documentation](https://onnxruntime.ai/docs/execution-providers/NNAPI-ExecutionProvider.html),
[XNNPACK documentation](https://onnxruntime.ai/docs/execution-providers/Xnnpack-ExecutionProvider.html),
and [Android NNAPI guidance](https://developer.android.com/ndk/guides/neuralnetworks).

## Raw artifact map

The evidence is intentionally kept under the gitignored `infra/ml/test/out/`
tree:

- `current_controlled/`: primary current-strategy run.
- `xnn4_controlled/` and `xnn4_controlled2/`: primary XNNPACK4 repeats.
- `current_perf/` and `xnn4/`: complete supporting runs.
- `focused_strategy_summary.csv` and `focused_strategy_summary.json`: parsed
  focused results and direct parity comparison.
- Each run contains `android/results.json`, Python golden results,
  `comparison_report.json`, and the Android platform log with raw session and
  inference timers.

Benchmark-only provider-selection and timing instrumentation was removed after
capturing the evidence; no production execution-provider code was changed as
part of this investigation.
