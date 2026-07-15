# Mobile ML model optimizations

This directory records the production transformations applied to Ente's mobile
face models and contains the resulting CDN artifacts under `models/`.

## Rebuilding the models

Run from the repository root:

```sh
uv run --project infra/ml/playground --no-sync python \
  infra/ml/playground/optimizations/optimize_face_models.py \
  --source-dir infra/ml/test/.cache/local_model_mirror \
  --output-dir infra/ml/playground/optimizations/models
```

The script performs only the transformations selected for production:

- YOLO: fix the batch dimension at 1 and use ONNX Runtime's basic optimizer to
  constant-fold the resulting shape graph.
- MobileFaceNet: fix the batch dimension at 1, replace 33 decomposed PReLU
  expressions with ONNX `PRelu`, make two implicit zero-padding attributes
  explicit, and remove the final L2 normalization that the Rust caller already
  performs.

The script verifies the source-model hashes and emits the two ONNX files plus
`model_manifest.json`, which records their output hashes, shapes, sizes, node
counts, and operator inventories.
