# iOS CoreML Benchmark and Execution-Plan Investigation

- **Investigation date:** 13 July 2026
- **Report date:** 14 July 2026
- **Device:** iPhone 15 Pro (`iPhone16,1`), Apple A17 Pro, iOS 26.5 (`23F77`)
- **Build mode:** Flutter profile build with release-mode Rust
- **Code revision used for the benchmark:** `3a3ad670ec`
- **Raw evidence:** [`infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/)

## Technical summary

The original expectation that CoreML should be substantially faster is correct, but it depends strongly on the CoreML model format and on choosing an execution policy per model.

- **MLProgram is the major performance unlock for MobileCLIP.** It reduced steady CLIP inference from 225.4 ms on CPU and 94.2 ms with the NeuralNetwork format to 18.6 ms. Its compute plan placed all 658 profiled CLIP operations on the A17 Pro GPU.
- **The NeuralNetwork format remains best for the YOLO face detector.** NeuralNetwork with `ALL` reduced steady detector inference from 171.7 ms on CPU to 11.4 ms. MLProgram was still fast at 20.6 ms, but not as fast as NeuralNetwork for this model.
- **MobileFaceNet should remain on CPU until its model is rewritten.** CPU already completes batch-1 inference in about 7.9 ms. NeuralNetwork CoreML made it slower and caused 1.1–1.5 second dynamic-shape specialization spikes. MLProgram restored stable CPU-like timing, but still incurred substantial session setup and generated unbounded-shape warnings.
- **`CPUAndNeuralEngine` did not use the Neural Engine for the MLProgram graphs on this device.** Every profiled operation was assigned to the CPU. `ALL` and `CPUAndGPU` instead used the GPU and were substantially faster.
- **Persistent model caching fixes much of the compilation cost, especially for CLIP, but costs roughly 300–353 MiB per configuration.** It does not fully solve MobileFaceNet's dynamic specialization cost.
- **`FastPrediction` did not produce a meaningful improvement in the controlled NeuralNetwork comparison.** It neither changed steady timings nor eliminated dynamic-batch spikes.
- **Numerical parity was excellent for every tested MLProgram policy.** NeuralNetwork `CPUAndGPU`, however, generated severely incorrect embeddings on multi-face inputs and failed two of fourteen fixtures.

The strongest measured uniform configuration is **MLProgram + `ALL` + cache + `FastPrediction`**, which reduced the sum of all timed inference calls from 5.85 seconds on CPU to 0.87 seconds, a 6.7× speedup, while passing all parity checks.

The likely best production configuration is a **per-model hybrid**:

- YOLO face detector: NeuralNetwork + `ALL` + persistent cache.
- MobileCLIP: MLProgram + `ALL` + persistent cache.
- MobileFaceNet: CPU until the model is rewritten with bounded shapes and CoreML-friendly operators.

That hybrid is an evidence-backed recommendation inferred from the isolated per-model measurements; it has not yet been run as one combined application configuration.

## The main result: MLProgram delivers the expected CoreML speedup

The table below reports warm-run pure-inference measurements. The detector and CLIP columns are medians after excluding each model's first inference. Face batch 7 and batch 10 are their observed calls. “All calls” sums every timed inference in the 14-fixture suite, including first-use calls and dynamic batches.

| Configuration | Detector B1 | CLIP B1 | Face B1 | Face B7 | Face B10 | All inference calls |
|---|---:|---:|---:|---:|---:|---:|
| CPU | 171.7 ms | 225.4 ms | 7.9 ms | 55.7 ms | 78.9 ms | 5,847 ms |
| NeuralNetwork `ALL` | **11.4 ms** | 94.2 ms | 19.6 ms | 1,416 ms | 319 ms | 4,471 ms |
| NeuralNetwork `CPUAndNeuralEngine` | 11.5 ms | 93.8 ms | 19.9 ms | 1,443 ms | 321 ms | 4,514 ms |
| NeuralNetwork `CPUAndGPU` | 33.7 ms | 194.5 ms | 16.3 ms | 164 ms | 223 ms | 3,906 ms[^invalid-nn-gpu] |
| MLProgram `ALL` | 20.6 ms | **18.6 ms** | **7.9 ms** | **55.2 ms** | **80.9 ms** | **871 ms** |
| MLProgram `CPUAndNeuralEngine` | 43.0 ms | 42.0 ms | 8.1 ms | 62.9 ms | 90.9 ms | 1,431 ms |
| MLProgram `CPUAndGPU` | 22.7 ms | 18.7 ms | 7.9 ms | 55.8 ms | 82.6 ms | 894 ms |
| MLProgram `ALL`, static-input restriction | 182.3 ms | 25.1 ms | 8.0 ms | 58.4 ms | 82.9 ms | 3,142 ms |

[^invalid-nn-gpu]: NeuralNetwork `CPUAndGPU` is not a valid production option despite its timing. It produced incorrect multi-face embeddings and failed parity for `people.jpeg` and `ui_app.webp`.

### Per-model interpretation

#### YOLO face detection

- CPU: 171.7 ms.
- NeuralNetwork `ALL`: 11.4 ms, approximately 15.1× faster than CPU.
- MLProgram `ALL`: 20.6 ms, approximately 8.3× faster than CPU.
- MLProgram `CPUAndNeuralEngine`: 43.0 ms because the profiled graph ran on CPU rather than ANE.
- Static-input restriction without changing the actual ONNX input declaration: 182.3 ms, effectively CPU performance.

The current YOLO ONNX input is declared as `[batch, 3, 640, 640]`, although the application always supplies batch 1. The graph contains dynamic shape work including `Shape`, `Gather`, `Reshape`, `Concat`, and related operations. Fixing the exported input to `[1, 3, 640, 640]` and constant-folding the resulting shape graph should reduce CPU-side shape work and make the model easier to compile.

#### MobileCLIP

- CPU: 225.4 ms.
- NeuralNetwork `ALL`: 94.2 ms, only about 2.4× faster than CPU.
- MLProgram `ALL`: 18.6 ms, approximately 12.2× faster than CPU.
- MLProgram `CPUAndGPU`: 18.7 ms, effectively identical to `ALL`.
- MLProgram `CPUAndNeuralEngine`: 42.0 ms because the whole profiled graph was assigned to CPU.

The model has a fixed `[1, 3, 256, 256]` input. Its 879-node ONNX graph includes 54 `Erf` operations and three `ReduceMean` operations. These operations fragmented or limited the NeuralNetwork-format path. With MLProgram, all 658 profiled runtime operations, including all `erf` and `reduce_mean` operations, were assigned to the GPU.

This is the clearest reason the earlier global CoreML experiment was less impressive than expected: the default NeuralNetwork format did not accelerate CLIP nearly as effectively as MLProgram.

#### MobileFaceNet

- CPU batch 1: 7.9 ms.
- NeuralNetwork `ALL` batch 1: 19.6 ms.
- NeuralNetwork dynamic batch 7: approximately 1.42 seconds in the warm run.
- MLProgram `ALL` batch 1: 7.9 ms.
- MLProgram `ALL` batch 7: 55.2 ms.
- MLProgram `ALL` batch 10: 80.9 ms.

MobileFaceNet's input is `[dynamic batch, 112, 112, 3]`. The NeuralNetwork format repeatedly specialized or compiled when the face count changed, causing the dominant 1.1–1.5 second latency spikes. MLProgram avoided those spikes, but its resulting performance was essentially the same as CPU, while its session still produced unbounded-dimension and shape-propagation warnings.

Because the CPU path is already fast and numerically stable, routing this model through CoreML currently adds complexity and startup cost without a meaningful inference benefit.

### Full parity-runner duration is directionally consistent but secondary

The integration-test timer includes lazy session creation, decoding, preprocessing, postprocessing, and other application work, so it is not used as the primary inference metric. It nevertheless shows the same broad outcome:

| Cold test configuration | Flutter test duration |
|---|---:|
| CPU | 26 s |
| NeuralNetwork `ALL`, no cache/default specialization | 29 s |
| NeuralNetwork `ALL`, cache/default specialization | 34 s |
| NeuralNetwork `ALL`, cache/`FastPrediction` | 21 s |
| NeuralNetwork `CPUAndNeuralEngine` | 21 s |
| NeuralNetwork `CPUAndGPU` | 14 s[^invalid-nn-gpu] |
| MLProgram `ALL`, profiling enabled | 27 s |
| MLProgram `CPUAndNeuralEngine`, profiling enabled | 22 s |
| MLProgram `CPUAndGPU`, profiling enabled | 22 s |
| MLProgram static-input restriction, profiling enabled | 18 s |
| MLProgram `ALL`, profiling disabled | **15 s** |

These one-pass end-to-end values are more sensitive to cache state, fixture staging, decoding, thermal state, and profiler overhead than the model-only timers. In particular, the 14-second NeuralNetwork GPU result is invalidated by its output-parity failure.

## Compute-plan profiling explains the hardware behavior

`ProfileComputePlan` was enabled for the format and compute-unit matrix. MLProgram emitted an operation-placement plan for each CoreML-compiled partition in the device console.

| Model | MLProgram `ALL` / `CPUAndGPU` | MLProgram `CPUAndNeuralEngine` |
|---|---:|---:|
| YOLO face detector | 211 GPU, 50 CPU | 261 CPU, 0 ANE |
| MobileCLIP | 658 GPU | 658 CPU, 0 ANE |
| MobileFaceNet | 160 GPU, 63 CPU | 223 CPU, 0 ANE |

### What the plan means

- `ALL` and `CPUAndGPU` produced the same operation assignment for these MLProgram graphs.
- `CPUAndNeuralEngine` assigned no profiled operation to ANE on this A17 Pro.
- MobileCLIP is an unusually clean GPU workload in MLProgram: all 658 profiled runtime operations ran on the GPU.
- YOLO kept shape-oriented operations on CPU while convolution, activation, pooling, and most arithmetic ran on GPU.
- MobileFaceNet alternated between CPU and GPU within the converted graph, while some ONNX operations were not represented in the CoreML plan.

For YOLO under MLProgram `ALL`, GPU placement comprised 62 convolution operations, 61 sigmoid operations, 61 multiplications, four max-pools, fourteen concatenations, seven additions, and two nearest-neighbor upsampling operations. CPU placement comprised shape, reshape, gather, squeeze, concat, and two convolution operations.

For MobileCLIP, the plan placed 189 convolutions, 54 divisions, 54 `erf` operations, 102 additions, 163 multiplications, all reductions, matrix operations, softmax operations, and the remaining runtime graph on GPU.

For MobileFaceNet, the plan placed 160 operations on GPU and 63 on CPU. The device also reported numerous unbounded-dimension errors around the dynamic input and tensors associated with the decomposed `Abs` activation sequences, plus an invalid-rank shape-propagation warning involving `squeeze`.

The NeuralNetwork format did not emit per-operation placement lines on this runtime even when `ProfileComputePlan` was enabled. Its `ALL` and `CPUAndNeuralEngine` timings were nearly identical, but the absence of a plan means the exact NeuralNetwork hardware assignment was not directly observed.

The underlying provider options and dynamic-shape caveats are documented by the [ONNX Runtime CoreML Execution Provider](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html). Apple's corresponding profiling workflow is described in [Optimize your Core ML usage](https://developer.apple.com/videos/play/wwdc2022/10027/).

## Compilation can be improved, but caching has a storage cost

`ModelCacheDirectory` stored actual converted models and compiled `.mlmodelc` packages. A true same-install relaunch confirmed that these artifacts were reused.

Session creation was timed separately from inference. The MLProgram values below come from the final no-profile run so that compute-plan enumeration and console output do not contaminate the result.

| Model | NeuralNetwork cold | NeuralNetwork warm | Reduction | MLProgram cold | MLProgram warm | Reduction |
|---|---:|---:|---:|---:|---:|---:|
| YOLO detector | 1,496 ms | 133 ms | 91% | 595 ms | 408 ms | 31% |
| MobileCLIP | 4,103 ms | 595 ms | 86% | 3,576 ms | 555 ms | 84% |
| MobileFaceNet | 1,352 ms | 1,124 ms | 17% | 2,467 ms | 1,709 ms | 31% |

### Cache findings

- Caching is highly effective for CLIP in both formats.
- Caching is highly effective for NeuralNetwork YOLO.
- Caching only modestly improves MobileFaceNet because dynamic shape handling and specialization remain.
- A cache does not remove the first hardware-use warm-up. In the no-profile MLProgram run, the first detector and CLIP inferences were about 66–69 ms before settling near 18–25 ms.
- The cache must be versioned or invalidated when a model changes. A production cache key should include the model SHA and all conversion options that affect the generated package.

### Cache storage

The on-device file inventory showed the following total cache sizes for one complete three-model configuration:

| Cache configuration | Size |
|---|---:|
| NeuralNetwork variants | approximately 300.4 MiB each |
| MLProgram variants | approximately 353.1 MiB each |
| MLProgram static-input restriction | approximately 291.4 MiB |

The MLProgram cache contained both generated model/weight data and compiled model/weight data. For example, the CLIP partitions included a roughly 129.9 MiB weight file in both the generated and compiled representation.

A production implementation should therefore:

- Cache selectively per model rather than automatically caching every session.
- Use an evictable, non-backed-up directory.
- Version the cache by model SHA and provider configuration.
- Measure the storage impact on a normal installation before enabling it globally.
- Consider replacing the iOS ONNX asset with a native CoreML asset rather than retaining both formats indefinitely.

## `FastPrediction` was not a solution

The NeuralNetwork `ALL` cache-default and cache-`FastPrediction` configurations were compared on same-install warm runs:

| Measurement | Default specialization | `FastPrediction` |
|---|---:|---:|
| Detector batch 1 | 11.42 ms | 11.36 ms |
| CLIP batch 1 | 93.81 ms | 94.20 ms |
| Face batch 1 | 19.77 ms | 19.62 ms |
| Face batch 7 | 1,414.61 ms | 1,416.03 ms |
| Sum of inference calls | 4,467.3 ms | 4,471.1 ms |

These differences are negligible and within run-to-run noise. Most importantly, `FastPrediction` did not eliminate MobileFaceNet's dynamic-shape spike.

`FastPrediction` remained enabled for the MLProgram matrix, but a separate MLProgram default-versus-fast experiment was not run. Nothing in the current evidence establishes an MLProgram benefit from this option.

## Static shapes require re-exporting the models

The `RequireStaticInputShapes` diagnostic did not make the current dynamic models static. It instead prevented CoreML from taking most or all of those graphs:

- YOLO detector inference regressed to approximately 182 ms, effectively CPU performance.
- MobileFaceNet remained at CPU-like timing, and it emitted no CoreML operation plan.
- MobileCLIP remained accelerated because it already has a static input, although its steady timing was approximately 25 ms rather than the 18.6 ms observed without the restriction.
- The static-only compute plan showed all 658 CLIP operations on GPU, only a small CPU shape subgraph for YOLO, and no MobileFaceNet CoreML plan.

The useful static-shape experiment is therefore not another provider flag. It is a new model export:

- Export YOLO with a fixed batch of 1.
- Export MobileFaceNet as fixed batch 1, bounded flexible shapes, or a small set of fixed batch buckets.
- Re-run the operation plan and parity suite on those exported models.

For MobileFaceNet, fixed buckets such as 1, 2, 4, 8, and 16 with padding are likely more CoreML-friendly than an unbounded batch. A native CoreML package could alternatively use bounded or enumerated input shapes.

## Unsupported operators have practical graph-level workarounds

### MobileCLIP: use MLProgram

The current CLIP blockers do not need manual graph rewriting. MLProgram successfully represented and assigned all profiled runtime operations, including `Erf` and `ReduceMean`, to GPU. This is already a working whole-model CoreML route.

### MobileFaceNet: replace the decomposed activation with `PRelu`

The MobileFaceNet graph contains 33 repetitions of this activation sequence:

```text
Relu(x) + alpha * (x - Abs(x)) * 0.5
```

Because `(x - |x|) / 2` is `min(x, 0)`, the sequence is mathematically:

```text
max(x, 0) + alpha * min(x, 0)
```

That is PReLU. The model should be re-exported with PReLU preserved or mechanically rewritten to a single ONNX `PRelu` operation. This removes all 33 `Abs` operations and gives the CoreML converter a direct activation operator rather than an unsupported or poorly specialized decomposition.

The rewrite is mathematically exact subject to the same alpha broadcasting. It still requires end-to-end parity validation because converter numerics, broadcasting, and floating-point ordering may differ.

### MobileFaceNet: remove redundant in-model normalization

The final ONNX operation is `LpNormalization`. Rust subsequently L2-normalizes every embedding again in `run_face_embedding`. Removing the in-model normalization and retaining the Rust normalization should preserve ordinary outputs while removing another CoreML boundary.

This change needs explicit testing for zero and near-zero embeddings because ONNX and Rust may use different epsilon behavior. It should not be accepted solely on the algebraic argument.

### What “the whole model on CoreML” means

These rewrites should make it possible for the functional graph to be represented by CoreML. They do not guarantee that every operation runs on GPU or ANE. CoreML may legitimately schedule operations on CPU, GPU, or ANE inside one model.

Moving a final normalization step into Rust still preserves the full application pipeline, but it means the literal normalization operation is no longer inside the CoreML model. If the strict requirement is a single native CoreML package containing every operation, the package must express an equivalent supported normalization.

## MLProgram preserved output parity; NeuralNetwork GPU did not

All candidates were compared against the CPU results generated on the same iPhone. The standard parity tool checked fourteen fixtures, including single-face, multi-face, orientation, HEIC, RAW, panorama, text, and no-face cases.

| Candidate | Files passed | Max CLIP cosine distance | Max face-embedding cosine distance | Result |
|---|---:|---:|---:|---|
| MLProgram `ALL` | 14/14 | `1.58e-12` | `1.01e-6` | Pass |
| MLProgram `CPUAndNeuralEngine` | 14/14 | `1.38e-11` | `5.14e-7` | Pass |
| MLProgram `CPUAndGPU` | 14/14 | `1.58e-12` | `1.01e-6` | Pass |
| MLProgram static-input restriction | 14/14 | `1.58e-12` | `2.22e-16` | Pass |
| NeuralNetwork `ALL` | 14/14 | `1.09e-4` | `2.60e-4` | Pass |
| NeuralNetwork `CPUAndNeuralEngine` | 14/14 | `1.09e-4` | `2.60e-4` | Pass |
| NeuralNetwork `CPUAndGPU` | 12/14 | `9.08e-5` | **`1.094`** | **Fail** |

MLProgram was not merely within tolerance; its CLIP outputs were essentially identical to CPU, and its face embeddings differed only at a very small floating-point level.

NeuralNetwork `CPUAndGPU` retained acceptable detector boxes, landmarks, scores, and CLIP output, but generated unusably different face embeddings for the multi-face fixtures:

- `people.jpeg`
- `ui_app.webp`

The maximum face-embedding cosine distance was 1.094, with many matched faces showing distances around 0.74–1.05. The failure correlates with dynamic multi-face batches, but the benchmark does not establish whether the root cause is an ONNX Runtime CoreML bug, CoreML specialization behavior, or a model-specific GPU issue. This configuration must not be shipped without a separately diagnosed fix.

The complete comparison is available in [`parity_comparison.json`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/parity_comparison.json).

## Why the original CoreML result was not dramatically faster

The earlier result was the combination of one large win, one partial win, and one regression:

1. YOLO became approximately 15× faster with NeuralNetwork CoreML.
2. CLIP became only approximately 2.4× faster because the NeuralNetwork format did not handle its graph nearly as effectively as MLProgram.
3. MobileFaceNet became slower for batch 1 and introduced second-scale specialization spikes when the batch changed.
4. Session conversion and compilation added several seconds on a cold start.

Those MobileFaceNet spikes almost completely cancelled the detector acceleration in the aggregate NeuralNetwork timing. Once CLIP moved to MLProgram and MobileFaceNet returned to stable CPU-like execution, the aggregate improvement became the expected 6.7×.

This was not a simulator or debug-build artifact. The measurements were obtained from a real A17 Pro device in a profile build with release-mode Rust.

## Native CoreML packages are promising, especially for CLIP

The repository currently contains ONNX assets, not ready native CoreML packages for these three models, and the application does not have a native CoreML package loader for this path. A direct native-package device benchmark would therefore have required new implementation code, which was outside the no-code-change constraint of this investigation.

The ONNX Runtime cache nevertheless demonstrated that converted MLProgram packages compile and run successfully on the device. It also exposed reasons to consider a native package:

- ORT creates multiple partition artifacts rather than one intentionally exported model.
- Generated and compiled weights are both stored, producing a 353 MiB three-model cache.
- Runtime conversion still costs several seconds on a cold install.
- A native package can express bounded or enumerated shapes more deliberately.
- A direct export from the original PyTorch model may preserve high-level operations better than converting an already lowered ONNX graph.

MobileCLIP is the best native-package pilot because:

- It already has a fixed input shape.
- MLProgram shows a clear 12× inference win.
- Its entire profiled runtime graph runs on GPU.
- Its runtime conversion and duplicated weights dominate the cache cost.

A native package should replace the iOS ONNX asset for that model rather than coexist permanently, otherwise the installation pays for both large representations.

## Recommended implementation direction

### Option A: measured uniform configuration

Use MLProgram + `ALL` + persistent cache for all three models.

Advantages:

- Measured 6.7× aggregate pure-inference speedup over CPU.
- Excellent parity across all fourteen fixtures.
- One uniform CoreML policy.
- Stable MobileFaceNet batch behavior.

Disadvantages:

- YOLO is roughly 9 ms slower per inference than with NeuralNetwork.
- MobileFaceNet gains no meaningful inference speed but retains about 1.7 seconds of warm session setup.
- Approximately 353 MiB of cache storage.
- MobileFaceNet continues to produce dynamic-shape warnings.

### Option B: recommended per-model hybrid

Use:

- NeuralNetwork + `ALL` + cache for YOLO.
- MLProgram + `ALL` + cache for MobileCLIP.
- CPU for MobileFaceNet.

Advantages:

- Selects the fastest valid measured path for each model.
- Avoids MobileFaceNet's CoreML session and dynamic-shape complexity.
- Retains the detector's 11.4 ms timing and CLIP's 18.6 ms timing.
- Avoids the invalid NeuralNetwork GPU embedding path.

Disadvantages:

- More policy and cache-management code.
- The combined hybrid has not yet been benchmarked as one build.
- Caching both YOLO and CLIP may still consume significant storage.

This is the recommended direction, but it should be validated as a combined build before being merged.

### Options that should not be selected

- Do not use NeuralNetwork `CPUAndGPU`; it failed face-embedding parity.
- Do not force `CPUAndNeuralEngine` for these models; the MLProgram compute plan assigned zero operations to ANE and performance was worse.
- Do not expect `FastPrediction` to fix dynamic batches.
- Do not enable `RequireStaticInputShapes` until the dynamic models themselves have been re-exported with fixed or bounded shapes.

## Proposed next experiments

Before making the production change, the following sequence gives the highest information value:

1. **Build and benchmark the per-model hybrid.** Confirm the combined pure-inference total, cold/warm session cost, parity, and cache size.
2. **Rewrite MobileFaceNet's decomposed PReLU sequences and remove redundant `LpNormalization`.** Run ONNX CPU parity before any CoreML test.
3. **Export fixed-shape MobileFaceNet variants.** Compare batch 1, a fixed maximum padded batch, and bucketed batches.
4. **Export YOLO with batch 1 fixed.** Re-run MLProgram and NeuralNetwork compute plans to see whether the 50 CPU operations shrink.
5. **Prototype native MLProgram MobileCLIP.** Measure package size, load time, first inference, steady inference, memory, power, and parity.
6. **Repeat the winning candidates in randomized order.** Use at least 5–10 runs per configuration and record thermal state to separate small differences from run-order noise.
7. **Measure energy and memory.** This investigation measured latency and output parity, not sustained power, thermal throttling, or peak memory.

## Scope and methodology

### Test corpus

The existing iOS ML parity runner processed fourteen fixtures spanning:

- JPEG, PNG, WebP, HEIC, and CR2 inputs.
- Rotation and mirroring metadata.
- Panorama and normal aspect ratios.
- No-face, single-face, and multi-face cases.
- Images containing text and app UI.

### Models

| Role | Asset | SHA-256 |
|---|---|---|
| Face detection | `yolov5s_face_640_640_dynamic.onnx` | `71a008707283b03db4881449a24f4da197f9dbd9ddaca5c91fcdb363fbf7e06f` |
| Face embedding | `mobilefacenet_opset15.onnx` | `472a0f7e24d0b070cbbdc031b085bc2a06c70655b3bdefb87dbd69bc98662f45` |
| CLIP image embedding | `mobileclip_s2_image.onnx` | `ef54ec66c687603eb4dd303e20d9b67e81069d3133b1c69a70028c76718b7752` |

### Configuration matrix

The investigation built and ran:

- CPU baseline.
- NeuralNetwork `ALL`, no cache, default specialization.
- NeuralNetwork `ALL`, cache, default specialization.
- NeuralNetwork `ALL`, cache, `FastPrediction`.
- NeuralNetwork `CPUAndNeuralEngine`, cache, `FastPrediction`.
- NeuralNetwork `CPUAndGPU`, cache, `FastPrediction`.
- MLProgram `ALL`, cache, `FastPrediction`, with compute-plan profiling.
- MLProgram `CPUAndNeuralEngine`, cache, `FastPrediction`, with compute-plan profiling.
- MLProgram `CPUAndGPU`, cache, `FastPrediction`, with compute-plan profiling.
- MLProgram `ALL`, cache, `FastPrediction`, static-input restriction, with profiling.
- MLProgram `ALL`, cache, `FastPrediction`, without profiling for uncontaminated startup and inference timing.

### Timing boundaries

Timers were placed immediately around the synchronous ONNX Runtime inference calls in Rust:

- Face detection: `onnx::run_f32_data`.
- Face embedding: `onnx::run_f32`.
- CLIP image embedding: `onnx::run_f32`.

The reported inference measurements therefore exclude:

- File I/O and fixture download.
- Image decoding and color-profile conversion.
- Resize, normalization, crop, and alignment preprocessing.
- Face detector postprocessing and non-max suppression.
- Embedding normalization performed after model output.
- ONNX Runtime session creation.

Session creation was timed and reported separately.

The logs also contain two expected non-model warnings: an embedded ICC profile could not be converted for one fixture, and CR2 decoding fell back from the general image decoder to the TIFF fallback because of an unsupported photometric interpretation. Both paths completed successfully, every relevant fixture was processed, and neither decode path is included in the pure-inference timers.

The report uses exact tables rather than charts because the experiment has one primary cold and warm suite per configuration, not a repeated distribution or time series. A chart would make the precision look stronger than the sampling design supports; the tables retain the auditable measured values.

### Cold and warm definition

- A cold configuration used a unique cache subdirectory and performed its first model conversion/compilation.
- A warm configuration relaunched the same installed app with the same data container and cache.
- Flutter-drive reruns that reinstalled or failed to expose the VM service were not used to claim cache effectiveness.
- The final MLProgram timing run disabled compute-plan profiling because profiling generated extensive per-operation output and distorted startup behavior.

### Profiling overhead

The MLProgram profile-enabled run took substantially longer during model load and, in one cold run, showed first detector and CLIP inferences near 934 ms and 2.07 seconds. The corresponding no-profile run showed first inferences near 68–71 ms and a complete test duration of approximately 15 seconds rather than 27 seconds.

Those profile-enabled startup values are treated as instrumented diagnostic behavior, not production latency. Operation placement comes from the profile-enabled runs; timing recommendations use the no-profile run where available.

## Limitations and robustness

- Each configuration received one primary cold suite and one same-install warm suite rather than many randomized repetitions.
- Medians across fixtures reduce individual-image noise, but configurations were executed sequentially, so thermal state and run order may affect small differences.
- The large differences—such as CLIP at 225 ms versus 18.6 ms, or NeuralNetwork face batch 7 at 1.4 seconds versus MLProgram at 55 ms—are far larger than plausible run noise.
- The benchmark measures latency and output parity, not energy, sustained thermal behavior, peak memory, or application responsiveness under concurrent work.
- `ProfileComputePlan` did not expose NeuralNetwork-format operation placement, so NeuralNetwork hardware assignment is inferred only from controlled compute-unit behavior, not directly observed.
- The direct native CoreML package path was assessed but not benchmarked because no native packages or loader existed in scope.
- The recommended hybrid combines independently measured best paths; its integrated performance, cache behavior, and parity still need direct validation.
- The operator rewrites are algebraically motivated but have not yet been applied or parity-tested.

## Raw artifact map

All retained raw output is under the gitignored [`infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/) directory. It contains 35 logs and 14 JSON files, 49 files in total, occupying approximately 12 MiB. It is a byte-for-byte copy of the original benchmark output; the aggregate source and destination manifest SHA-256 was:

```text
7f7b90e0953b7948f1b9d73b6292e76584a533557bf67a3d9b625d7d06f7efb9
```

Key evidence files:

- CPU baseline: [`cpu/run.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/cpu/run.log) and [`cpu/results.json`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/cpu/results.json).
- NeuralNetwork default/no-cache: [`nn_all_nocache_default/run.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_all_nocache_default/run.log).
- NeuralNetwork cache/default cold and true warm: [`nn_all_cache_default/cold.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_all_cache_default/cold.log) and [`manual_warm.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_all_cache_default/manual_warm.log).
- NeuralNetwork `ALL` + fast: [`nn_all_cache_fast/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_all_cache_fast/).
- NeuralNetwork CPU+ANE: [`nn_ane_cache_fast/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_ane_cache_fast/).
- NeuralNetwork CPU+GPU: [`nn_gpu_cache_fast/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/nn_gpu_cache_fast/).
- MLProgram `ALL` compute plan: [`mlp_all_cache_fast/warm.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/mlp_all_cache_fast/warm.log).
- MLProgram CPU+ANE compute plan: [`mlp_ane_cache_fast/warm.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/mlp_ane_cache_fast/warm.log).
- MLProgram CPU+GPU compute plan: [`mlp_gpu_cache_fast/warm.log`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/mlp_gpu_cache_fast/warm.log).
- MLProgram static-input diagnostic: [`mlp_all_cache_fast_static/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/mlp_all_cache_fast_static/).
- MLProgram `ALL` uncontaminated timing: [`mlp_all_cache_fast_noprofile/`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/mlp_all_cache_fast_noprofile/).
- Parity comparison: [`parity_comparison.json`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/parity_comparison.json).
- On-device cache file inventory: [`device_files.json`](infra/ml/test/out/ios_coreml_benchmark_artifacts_2026-07-13/device_files.json).

## Decision questions for review

The evidence supports discussing these concrete choices:

1. Should the first production change be the measured uniform MLProgram configuration, or the faster but not-yet-integrated per-model hybrid?
2. Is a 300–353 MiB CoreML cache acceptable, or should caching be selective and/or capped?
3. Should MobileFaceNet stay on CPU for the first release while its graph and batch model are rewritten?
4. Is a native MobileCLIP package worth a separate implementation phase to reduce conversion time and duplicate storage?
5. What minimum iOS version should the MLProgram route support, and does the app need a fallback policy for older devices?

These questions can be decided independently of the temporary benchmark instrumentation; all investigation-only code was removed after the run.
