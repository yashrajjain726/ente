# Android WebGPU Release Smoke Test, MobileFaceNet Rewrite, and Tuning Benchmark

- **Date:** 17 July 2026
- **Device:** Pixel 8 (`shiba`), Google Tensor G3, Mali-G715, Android 17 / API 37
- **Base revision:** `6a74a6aba6`, plus temporary benchmark-only instrumentation
- **Build:** Flutter AOT release and release-mode Rust, `independent` flavor
- **ONNX Runtime:** custom 1.27.0 Android AAR, release `ort-1.27.0-webgpu-pilot.5`
- **WebGPU configuration:** forced `true` in the parity runner for this investigation
- **Raw evidence:** [`infra/ml/test/out/android_webgpu_release_2026-07-17/`](../../../test/out/android_webgpu_release_2026-07-17/)
- **Machine-readable summary:** [`benchmark_summary.json`](../../../test/out/android_webgpu_release_2026-07-17/benchmark_summary.json)
- **Follow-up revision:** `18e246ff6432`, plus the model rewrite and temporary tuning instrumentation described below
- **Follow-up evidence:** [`infra/ml/test/out/android_webgpu_tuning_2026-07-17/`](../../../test/out/android_webgpu_tuning_2026-07-17/)
- **Follow-up summary:** [`benchmark_summary.json`](../../../test/out/android_webgpu_tuning_2026-07-17/benchmark_summary.json)
- **Fusion follow-up revision:** `0ee9992b7a0c`, plus temporary release benchmark instrumentation
- **Fusion follow-up evidence:** [`infra/ml/test/out/android_webgpu_fusions_2026-07-17/`](../../../test/out/android_webgpu_fusions_2026-07-17/)
- **Fusion follow-up summary:** [`benchmark_summary.json`](../../../test/out/android_webgpu_fusions_2026-07-17/benchmark_summary.json)

## Fusion follow-up outcome: exact GELU and native PReLU are real wins

Two further FP32 experiments improved the model hot paths without changing
application-level output on the 14-fixture corpus:

- Replacing MobileCLIP's 54 expanded exact-GELU expressions with the standard
  ONNX `Gelu(approximate="none")` operator reduced median MobileCLIP inference
  from **135.505 ms to 127.103 ms**, a **6.20% improvement**. Its p95 improved
  by 5.13%. YOLO was unchanged, confirming that this was a CLIP-local gain.
- Adding native WebGPU `PRelu` support and a WebGPU YOLO SiLU fusion to the
  custom ONNX Runtime reduced MobileFaceNet from **14.369 ms to 10.772 ms per
  face**, a **25.03% improvement**. YOLO improved from **107.844 ms to
  106.271 ms**, or 1.46%.

The GELU result is large and isolated enough to recommend adopting after an
iOS/CoreML device check. Native WebGPU PReLU is also compelling, but requires
an Android-specific MobileFaceNet artifact or retaining separate Android and
iOS graphs: the portable arithmetic rewrite remains necessary for the shared
CoreML-compatible model. The YOLO SiLU change is directionally positive but
small enough that it should be repeated across run order and more Android
devices before being credited as a stable 1.46% gain.

### FP32 exact GELU fusion

The benchmark-only generator, retained with the
[raw evidence](../../../test/out/android_webgpu_fusions_2026-07-17/optimize_clip_model.py),
recognizes the exact expression:

```text
0.5 * x * (1 + Erf(x / sqrt(2)))
```

and replaces it with the standard opset-20 `Gelu` operator using
`approximate="none"`. This is not a tanh or QuickGELU approximation. The
operator is implemented by both the WebGPU and CoreML execution providers in
the ONNX Runtime source used for this investigation.

| Property | Original MobileCLIP | Exact-GELU MobileCLIP |
|---|---:|---:|
| ONNX opset | 16 | 20 |
| Serialized nodes | 879 | 504 |
| Exact GELU sites | 54 expanded expressions | 54 `Gelu` nodes |
| `Erf` / `Div` nodes | 54 / 54 | 0 / 0 |
| Model bytes | 143,061,211 | 143,057,352 |
| SHA-256 | `ef54ec66…7752` | `205a430a…ce7e` |
| MobileCLIP inference p50 | 135.505 ms | **127.103 ms** |
| MobileCLIP inference p95 | 144.448 ms | **137.039 ms** |

The output model passes `onnx.checker.check_model(..., full_check=True)`. Five
deterministic random CPU inputs had minimum raw-output cosine
`0.999999999492`; the maximum absolute difference was `0.0733948`, caused by
the different floating-point evaluation path. More importantly for the app,
all 14 normalized Android CLIP embeddings were byte-for-byte equal to the FP32
baseline. Face counts, detections, and all 25 face embeddings were also exact.

The timing controls support a model-local interpretation: YOLO changed by
-0.01%, while MobileFaceNet changed by +0.66%. At this corpus frequency, 14
CLIP calls save approximately **117.6 ms of aggregate model inference**.

### WebGPU-local PReLU and YOLO SiLU fusion

The custom release AAR added three WebGPU capabilities:

1. A broadcast-capable PReLU binary elementwise kernel.
2. WebGPU execution-provider registrations for ONNX `PRelu`.
3. Recognition of `x * Sigmoid(x)` as QuickGELU with alpha `1.0`, which is
   exactly SiLU, followed by `ConvActivationFusion` support for that activation.

This allowed Android to use the compact canonical MobileFaceNet graph with 33
PReLU nodes instead of the five-operator portable expression at every site.
The YOLO model itself was unchanged; only the custom runtime could fuse its
SiLU pattern.

| Model/control | Portable FP32 baseline p50 | Custom WebGPU runtime p50 | Change | Baseline p95 | Custom p95 | Corpus parity |
|---|---:|---:|---:|---:|---:|---|
| YOLO, SiLU fusion target | 107.844 ms | **106.271 ms** | **-1.46%** | 112.334 ms | 110.977 ms | Exact |
| MobileFaceNet, native PReLU | 14.369 ms | **10.772 ms** | **-25.03%** | 17.740 ms | 13.755 ms | Exact |
| MobileCLIP, unchanged control | 135.505 ms | 136.892 ms | +1.02% | 144.448 ms | 143.465 ms | Exact |

The 25 face calls in this corpus save approximately **89.9 ms** from native
PReLU alone. Including YOLO, the two targeted models save about **111.9 ms**
of aggregate inference per corpus. The unchanged CLIP control moved in the
opposite direction by 1.02%, which is why the smaller YOLO result is treated
as provisional rather than conclusive.

All 14 fixture IDs and face counts matched. Detection boxes, landmarks, and
scores had maximum absolute difference `0.0`; the 25 face embeddings and all
CLIP embeddings were byte-for-byte equal to baseline.

The custom ONNX Runtime AAR was built in release mode with SHA-256
`fa99ac56…9468`. Its `libonnxruntime.so` build ID was
`765ed4f44a9e67c8d4246e3a59420eab6c084279`, and the same build ID was present
inside the benchmark APK. Dawn initialized its Vulkan backend in the app
process, all three sessions loaded with the forced platform-default WebGPU
policy, and no provider-construction fallback was logged. Unlike the earlier
placement audit, this follow-up did not enable verbose per-node assignment
logging; the evidence proves the patched WebGPU runtime executed successfully
but does not provide a second node-by-node placement count.

### Fusion benchmark method and recommendation

Both timing experiments used a non-debuggable `independentRelease` APK,
Flutter AOT product mode (`dart.vm.product == true`, profile false), and Rust
release builds. WebGPU was temporarily forced on. Each full timing run covered
one warm-up plus five measured passes for every fixture: 84 raw YOLO calls, 84
raw MobileCLIP calls, and 150 raw MobileFaceNet calls, leaving 70, 70, and 125
measured calls after warm-up removal. Timers covered input tensor creation,
synchronous `Session::run`, output access/copy, and their complete total.
Android thermal status was `0` before and after each retained run.

The exact-GELU timing run completed the full five-pass protocol. Because its
first result-file transport was removed by Gradle together with the test APK,
its correctness JSON was recaptured in a separate full-corpus run with one
warm-up and one measured pass; the preserved five-pass native timing log is
the source of the latency values above. The custom PReLU/SiLU run retained both
five-pass timings and correctness output in one run. The baseline latency log
was also newly captured with the five-pass protocol; its correctness reference
was reused from the immediately preceding same-device FP32 run, whose model
hashes, runtime, and provider configuration were identical.

Recommended next steps:

1. **Adopt the exact-GELU MobileCLIP graph** after running the same generated
   model on the iOS/CoreML benchmark corpus. It is FP32, parity-safe at the app
   boundary, and produced the clearest new CLIP gain.
2. **Upstream or carry the WebGPU PReLU kernel**, and ship a compact
   Android-specific PReLU MobileFaceNet model if maintaining per-platform
   artifacts is acceptable. Keep the portable arithmetic graph for CoreML.
3. **Keep the YOLO SiLU fusion in the candidate runtime**, but repeat it in
   randomized A/B/A order and on at least one additional Mali or Adreno device
   before treating the 1.46% result as a production forecast.
4. Keep the production precision policy at **FP32**, as requested. No FP16
   result is needed to obtain either of these gains.

## Follow-up outcome: MobileFaceNet fixed; provider tuning is effectively neutral

The follow-up changes the most important conclusion from the initial smoke
test. MobileFaceNet no longer needs a CPU-specific provider policy. Rewriting
its 33 unsupported `PRelu` nodes as an exact, portable arithmetic expression
makes the entire optimized graph execute on WebGPU and reduces median FP32
MobileFaceNet inference from **99.5 ms to 14.4 ms per face**. That is an 85.5%
latency reduction, or a **6.91x speedup**, with output-identical full-corpus
results.

Verbose ONNX Runtime placement diagnostics reported:

| Model | Optimized nodes placed on WebGPU | CPU nodes | Result |
|---|---:|---:|---|
| Static YOLO | 277 | 0 | Fully WebGPU |
| MobileCLIP | 660 | 0 | Fully WebGPU |
| Portable MobileFaceNet | 231 | 0 | **Fully WebGPU** |

The complete release suite then compared graph capture, preferred layout,
FP16, all four bucket buffer caches, and preallocated GPU I/O. Each variant ran
the full 14-fixture corpus with one warm-up and five measured passes per
fixture. All runs began and ended at Android thermal status `0`.

The actionable result is:

- Keep **FP32**, following the requested accuracy-first final policy. FP16 was
  much faster, but two very small faces in a screenshot produced face-embedding
  cosines near `0.959` relative to FP32.
- Keep **NCHW**. NHWC made every model's median inference 0.36–0.41% slower.
- Keep normal ONNX Runtime-managed input/output. Explicit GPU I/O
  preallocation merely moved synchronization from `Session::run` into the
  device-to-host copy and did not improve total latency.
- Graph capture and bucket caches produced small, parity-exact isolated gains,
  so they were selected for the requested final combination. The combination
  itself was effectively neutral: 0.38% faster end to end without CR2, while
  YOLO and CLIP total-inference medians were 0.77% and 0.50% slower.
- Do **not** enable graph capture or bucket caches in production based on this
  single-device result. Their isolated changes are within run-to-run noise and
  did not add up in the final controlled configuration.

The recommended Android policy after this follow-up is therefore the simple
one: **portable FP32 models, NCHW, WebGPU -> XNNPACK -> CPU fallback, default
buffer caches, and normal I/O**. The model rewrite is a clear win; the tested
provider knobs are not.

The reproducible generator and manifest now describe
`mobilefacenet_portable_static_b1.onnx`. The app's production model URL/SHA was
not changed because this run did not upload a new CDN artifact. Deployment
requires uploading the generated file and then updating `FaceEmbeddingModel`
to its final remote filename and SHA-256.

## Portable MobileFaceNet operator rewrite

Replacing PReLU with one plain `Relu` would be incorrect whenever the learned
slope is nonzero. The exact identity is:

```text
PReLU(x, alpha) = Relu(x) - alpha * Relu(x * -1)
```

The rewrite deliberately uses `Mul(x, -1)` instead of `Neg(x)`. `Relu`, `Mul`,
and `Sub` are all listed by both the
[CoreML MLProgram operator table](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html#mlprogram)
and the
[WebGPU operator table](https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md),
whereas `Neg` is not listed for CoreML MLProgram. A scalar `LeakyRelu` is not
equivalent because MobileFaceNet has learned per-channel slopes. `Where` also
lacks documented CoreML MLProgram coverage. The selected five-node expression
is therefore the smallest exact common representation found in the two
published support lists.

Each original six-node `Relu`/`Abs`/`Sub`/`Mul`/`Mul`/`Add` activation becomes
five nodes: positive `Relu`, multiply by `-1`, negative `Relu`, slope `Mul`, and
`Sub`. The `[1, C, 1, 1]` slope tensors are preserved exactly.

| Property | Previous WebGPU model | Portable model |
|---|---:|---:|
| Serialized ONNX nodes | 101 | 233 |
| `PRelu` nodes | 33 | 0 |
| Portable activation nodes per channel block | 1 unsupported `PRelu` | 5 supported arithmetic nodes |
| Model bytes | 5,238,749 | 5,278,803 |
| SHA-256 | `f525daf3…ccfd` | `0763fc33…a36` |
| ORT execution placement | 132 WebGPU / 33 CPU | **231 WebGPU / 0 CPU** |
| FP32 steady total-inference p50 | 99.5 ms | **14.4 ms** |

Serialized node counts and ORT optimized-plan node counts are different
quantities. The placement result is the relevant runtime comparison: 33 CPU
nodes before the rewrite and zero after it.

Validation was performed at three levels:

1. `onnx.checker.check_model(..., full_check=True)` passes.
2. Twenty deterministic random inputs compared against the prior optimized
   PReLU model had maximum absolute difference `0.0`; minimum cosine was within
   floating-point rounding of 1 (maximum cosine distance `5.960e-8`).
3. The 14-fixture Android corpus produced identical face counts, CLIP outputs,
   and all 25 face embeddings relative to the earlier FP32 Android result. The
   minimum reported cosine was `0.9999999999999998`.

CoreML compatibility in this follow-up is based on the published MLProgram
operator list and ONNX validation. The new graph was benchmarked and its full
GPU placement proven on Android WebGPU; it was not re-profiled on an iPhone in
this run.

## Follow-up benchmark method

All tuning APKs were Flutter AOT release builds with release Rust. The runner
asserted `dart.vm.product == true` and `dart.vm.profile == false`; the final APK
was non-debuggable according to `apkanalyzer`. The final FP32-winners APK was
243,478,077 bytes with SHA-256
`e2a805408ccf71e2d48822117cd2a54feaccabdde699c41cb16a100b8974b5af`.

For every variant:

- WebGPU was temporarily forced on in the integration runner.
- App data was cleared, giving process-cold sessions and model loads.
- All 14 fixtures ran six times: one unmeasured warm-up and five measured
  passes.
- Exact native timers covered input tensor preparation, synchronous inference,
  output access/copy, and their combined total for every model call.
- The measured corpus contains 70 YOLO calls, 70 MobileCLIP calls, and 125
  MobileFaceNet calls after warm-up removal.
- Results, complete logcat, and before/after thermal snapshots were retained
  for each run.

The end-to-end column below sums one like-numbered measured pass for every
fixture and reports the median of the five corpus rounds. CR2 is excluded from
that column because the failed native RAW path contributes a variable external
timeout of roughly 6–16 seconds before the successful JPEG fallback. All model
inference values and correctness checks still include the CR2 fallback.

## Isolated tuning results

“Inference” is the complete native inference timer, not `Session::run` alone.
Percentages are versus the portable FP32/NCHW/default-cache/normal-I/O baseline.

| Variant | YOLO p50 | Change | MobileCLIP p50 | Change | MobileFaceNet p50 | Change | Corpus p50, no CR2 | Change | Output parity vs FP32 baseline |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **FP32 baseline** | 108.111 ms | — | 136.637 ms | — | 14.397 ms | — | 9,676.216 ms | — | Exact |
| Graph capture | 108.161 ms | +0.05% | **134.893 ms** | **-1.28%** | 14.373 ms | -0.16% | **9,597.319 ms** | **-0.82%** | Exact |
| Preferred NHWC | 108.540 ms | +0.40% | 137.198 ms | +0.41% | 14.449 ms | +0.36% | 9,704.058 ms | +0.29% | Exact |
| All four bucket caches | 108.166 ms | +0.05% | 137.276 ms | +0.47% | **13.738 ms** | **-4.58%** | 9,613.981 ms | -0.64% | Exact |
| Preallocated GPU I/O | 108.465 ms | +0.33% | 137.751 ms | +0.81% | 13.838 ms | -3.88% | 9,655.368 ms | -0.22% | Exact |
| Full FP16 models | **78.299 ms** | **-27.58%** | **102.451 ms** | **-25.02%** | **12.427 ms** | **-13.68%** | **8,727.863 ms** | **-9.80%** | Face accuracy concern |
| **Final FP32 combination**: graph capture + bucket caches + NCHW + normal I/O | 108.946 ms | +0.77% | 137.317 ms | +0.50% | 14.373 ms | -0.17% | 9,638.985 ms | -0.38% | Exact |

The baseline's per-model p95 total-inference values were 114.050 ms for YOLO,
145.308 ms for MobileCLIP, and 19.474 ms for MobileFaceNet. The final FP32
combination's corresponding values were 114.048, 146.538, and 18.956 ms. There
is no hidden tail-latency win large enough to change the recommendation.

Using the median model totals and this corpus's 14 YOLO, 14 CLIP, and 25 face
calls, the portable FP32 baseline needs about **3.786 seconds** of model
inference per corpus. The initial split-MobileFaceNet run needed 5.862 seconds.
The operator rewrite therefore reduces aggregate model time by approximately
35.4% on this face distribution.

### Graph capture

Graph capture was parity-exact. It improved MobileCLIP by 1.28% and the
no-CR2 corpus by 0.82%, while YOLO and MobileFaceNet were flat. Those changes
were small enough to be run-order noise, and the final combination did not
retain the CLIP improvement. It should remain off until repeated across devices
or supported by production telemetry.

### NCHW versus NHWC

NCHW won every pure-inference comparison. NHWC increased median total
inference by 0.40% for YOLO, 0.41% for MobileCLIP, and 0.36% for MobileFaceNet.
The Pixel 8's WebGPU/Vulkan implementation should keep NCHW for these exported
graphs.

### Bucket buffer caches

Setting storage, uniform, query-resolve, and default buffer caches to `bucket`
was parity-exact. MobileFaceNet improved 4.58% in isolation, but YOLO was flat
and CLIP regressed 0.47%. The improvement did not survive the final combined
run, where MobileFaceNet was only 0.17% faster than baseline. The added cache
policy is not justified by this evidence.

### Preallocated WebGPU I/O

The preallocation experiment used persistent CPU and `WebGPU_Buffer` tensors,
`IoBinding`, and synchronous `CopyTensors` calls around each inference. It
worked and was output-identical, but the timing boundary exposed why it did not
help:

| Model | Policy | Input p50 | `Session::run` p50 | Output/sync p50 | Complete inference p50 |
|---|---|---:|---:|---:|---:|
| YOLO | Normal ORT I/O | 0.031 ms | 107.385 ms | 0.800 ms | **108.111 ms** |
| YOLO | Preallocated GPU I/O | 2.212 ms | 13.610 ms | 92.544 ms | 108.465 ms |
| MobileCLIP | Normal ORT I/O | 0.024 ms | 136.603 ms | 0.008 ms | **136.637 ms** |
| MobileCLIP | Preallocated GPU I/O | 0.679 ms | 30.162 ms | 105.752 ms | 137.751 ms |
| MobileFaceNet | Normal ORT I/O | 0.018 ms | 14.387 ms | 0.003 ms | 14.397 ms |
| MobileFaceNet | Preallocated GPU I/O | 0.405 ms | 7.406 ms | 5.619 ms | **13.838 ms** |

With explicit GPU output tensors, `Session::run` returns before the final
device work and readback are synchronized. The output copy then pays that cost.
Reporting only the run column would falsely claim an approximately 8x YOLO
speedup; the complete timer correctly shows a 0.33% regression. Keeping normal
ORT-managed I/O is simpler and faster overall for the current CPU
preprocessing/postprocessing pipeline.

### FP32 versus FP16

All three models were converted to genuine FP16 graphs with FP16 inputs,
outputs, weights, and intermediates; this was not merely an input cast. Each
passed full ONNX checking and executed the complete corpus.

| Model | FP32 bytes | FP16 bytes | FP32 p50 | FP16 p50 | Latency change |
|---|---:|---:|---:|---:|---:|
| YOLO | 32,355,091 | 16,229,361 | 108.111 ms | **78.299 ms** | **-27.58%** |
| MobileCLIP | 143,061,211 | 71,753,862 | 136.637 ms | **102.451 ms** | **-25.02%** |
| MobileFaceNet | 5,278,803 | 2,723,399 | 14.397 ms | **12.427 ms** | **-13.68%** |

FP16 preserved all 14 face counts. MobileCLIP parity was strong: median cosine
`0.9998346`, minimum `0.9997101`. Face embeddings had median cosine
`0.9991900`, but the minimum was `0.9590737`; the two worst cases were very
small faces in `ui_app.webp`. Detector rounding slightly changes their boxes
and landmarks, and that crop difference is amplified by the embedding model.

Following the requested final policy, FP16 was therefore **not** included in
the combined run. It remains the only tested setting with a large speedup and
is worth a future mixed-precision accuracy study—for example FP16 YOLO/CLIP
with FP32 MobileFaceNet and explicit face-quality thresholds—but it should not
replace the current FP32 face pipeline without a broader retrieval/identity
evaluation.

## Final FP32 combination

The full final test used FP32 models, graph capture, all bucket caches, NCHW,
and normal ORT I/O. It completed all 14 fixtures and all expected model calls,
remained at thermal status `0`, and produced exact FP32 baseline parity:

| Correctness check | Result |
|---|---:|
| Fixtures with identical face counts | 14/14 |
| CLIP cosine, minimum | `0.9999999999999998` |
| Face-embedding cosine, minimum | `0.9999999999999998` |
| Fatal/native/ORT failures | 0 |

The combination's no-CR2 corpus median was 9,638.985 ms versus 9,676.216 ms
for baseline, only 0.38% faster. Its aggregate median model time was 3.807
seconds versus 3.786 seconds for baseline. In other words, the tiny pipeline
change came from non-model variation; the combined model configuration was
slightly slower overall. No runtime tuning knob tested here closes the gap to
the approximately 20 ms CoreML results on A17 Pro.

The remaining Android performance gap is more likely architectural: CoreML
can fuse and compile these graphs for Apple's tightly integrated GPU/ANE stack,
while ORT WebGPU emits portable Dawn/Vulkan workloads with different fusion,
dispatch, and memory behavior. The next high-value work is model-level
optimization or quantization and cross-vendor measurement, not additional
session flags from this set.

## Initial smoke-test outcome (superseded by the follow-up above)

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

## Initial recommendation (superseded by the follow-up above)

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

The follow-up evidence is kept under the gitignored
`infra/ml/test/out/android_webgpu_tuning_2026-07-17/` tree:

- `runs/<variant>/results.json`: application-visible outputs and five measured
  end-to-end samples per fixture.
- `runs/<variant>/logcat.txt`: exact per-model input, inference, output, and
  total timings for all warm-up and measured calls.
- `runs/<variant>/thermal_before.txt` and `thermal_after.txt`: Android thermal
  service snapshots.
- `benchmark_summary.json`: parsed distributions and FP32-baseline parity for
  every isolated and final run.
- `placement_evidence.txt`: the filtered verbose ORT placement proof for all
  three rewritten-model sessions.
- `models/fp16/`: the checked FP16 experiment artifacts.
- `apks/`: the exact release APKs used for FP32, FP16, and the final FP32
  combination.

The fusion follow-up evidence is kept under the gitignored
`infra/ml/test/out/android_webgpu_fusions_2026-07-17/` tree:

- `runs/baseline_fp32/`, `runs/gelu_fp32/`, and
  `runs/webgpu_local_fusions_fp32/`: retained results, native timing logs,
  release APKs, and thermal snapshots for the two reported experiments and
  their control.
- `models/mobileclip_s2_image_gelu_opset20.onnx`: the exact-GELU model used on
  device.
- `benchmark_summary.json` and `analyze_fusions.py`: parsed distributions,
  detailed parity metrics, and the reproducible analyzer.
- `optimize_clip_model.py`: the benchmark-only exact-GELU model generator.
- `custom_ort_webgpu_fusions.patch`: the tested ONNX Runtime source diff,
  including the WebGPU PReLU and SiLU-fusion changes.
- `pixel8_vkjson.json`: the Pixel 8 Vulkan device/driver capability snapshot.

The forced WebGPU flag, system-property variants, I/O-binding pilot, and all
benchmark-only Dart/Rust instrumentation were removed after collecting and
validating these artifacts. No production provider-selection behavior was
changed. The reproducible portable MobileFaceNet transformation, its manifest,
and this report are the durable changes.
