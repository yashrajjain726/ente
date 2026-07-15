#!/usr/bin/env python3
"""Build Ente's optimized static face models for the mobile ML pipeline.

The generated models remain standard ONNX. The transformations make their
graphs easier for CoreML and mobile CPU runtimes to optimize while preserving
the outputs used by the application.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import onnx
import onnxruntime as ort
from onnx import helper, numpy_helper

YOLO_SOURCE = "yolov5s_face_640_640_dynamic.onnx"
YOLO_SOURCE_SHA256 = "71a008707283b03db4881449a24f4da197f9dbd9ddaca5c91fcdb363fbf7e06f"
YOLO_OUTPUT = "yolov5s_face_640_640_static_b1.onnx"
FACE_SOURCE = "mobilefacenet_opset15.onnx"
FACE_SOURCE_SHA256 = "472a0f7e24d0b070cbbdc031b085bc2a06c70655b3bdefb87dbd69bc98662f45"
FACE_OUTPUT = "mobilefacenet_prelu_static_b1.onnx"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source_model(
    source_dir: Path,
    file_name: str,
    expected_sha256: str,
) -> onnx.ModelProto:
    path = source_dir / file_name
    actual_sha256 = sha256(path)
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"Unexpected SHA-256 for {path}: {actual_sha256}; "
            f"expected {expected_sha256}"
        )
    return onnx.load(path)


def node_consumers(model: onnx.ModelProto) -> dict[str, list[onnx.NodeProto]]:
    consumers: dict[str, list[onnx.NodeProto]] = {}
    for node in model.graph.node:
        for input_name in node.input:
            consumers.setdefault(input_name, []).append(node)
    return consumers


def only_consumer(
    consumers: dict[str, list[onnx.NodeProto]],
    tensor: str,
    op_type: str,
) -> onnx.NodeProto | None:
    matches = consumers.get(tensor, [])
    if len(matches) == 1 and matches[0].op_type == op_type:
        return matches[0]
    return None


def other_input(node: onnx.NodeProto, known_input: str) -> str | None:
    others = [input_name for input_name in node.input if input_name != known_input]
    return others[0] if len(others) == 1 else None


def is_scalar_initializer(
    initializers: dict[str, onnx.TensorProto],
    name: str,
    expected: float,
) -> bool:
    initializer = initializers.get(name)
    if initializer is None:
        return False
    values = numpy_helper.to_array(initializer).reshape(-1)
    return values.size == 1 and float(values[0]) == expected


def rewrite_prelu_decompositions(model: onnx.ModelProto) -> int:
    """Replace max(x, 0) + alpha * min(x, 0) decompositions with PRelu."""
    consumers = node_consumers(model)
    initializers = {
        initializer.name: initializer for initializer in model.graph.initializer
    }
    replacements: dict[str, onnx.NodeProto] = {}
    removed_names: set[str] = set()

    node_names = [node.name for node in model.graph.node]
    if not all(node_names) or len(node_names) != len(set(node_names)):
        raise ValueError("PReLU rewrite requires unique, non-empty ONNX node names")

    for relu in (node for node in model.graph.node if node.op_type == "Relu"):
        input_name = relu.input[0]
        abs_nodes = [
            node for node in consumers.get(input_name, []) if node.op_type == "Abs"
        ]
        if len(abs_nodes) != 1:
            continue
        abs_node = abs_nodes[0]

        sub = only_consumer(consumers, abs_node.output[0], "Sub")
        if sub is None or list(sub.input) != [input_name, abs_node.output[0]]:
            continue

        alpha_mul = only_consumer(consumers, sub.output[0], "Mul")
        if alpha_mul is None:
            continue
        alpha_name = other_input(alpha_mul, sub.output[0])
        alpha = initializers.get(alpha_name or "")
        if alpha is None or list(alpha.dims[:1]) != [1]:
            continue

        half_mul = only_consumer(consumers, alpha_mul.output[0], "Mul")
        if half_mul is None:
            continue
        half_name = other_input(half_mul, alpha_mul.output[0])
        if half_name is None or not is_scalar_initializer(
            initializers, half_name, 0.5
        ):
            continue

        add = only_consumer(consumers, relu.output[0], "Add")
        if add is None or set(add.input) != {relu.output[0], half_mul.output[0]}:
            continue
        half_add = only_consumer(consumers, half_mul.output[0], "Add")
        if half_add is None or half_add.name != add.name:
            continue

        # The export stores slopes as [1, C, 1, 1]. ONNX PRelu and the mobile
        # accelerators expect a per-channel [C, 1, 1] slope for NCHW tensors.
        if list(alpha.dims[-2:]) != [1, 1]:
            continue
        slope_dims = list(alpha.dims[1:])
        del alpha.dims[:]
        alpha.dims.extend(slope_dims)

        replacements[relu.name] = helper.make_node(
            "PRelu",
            [input_name, alpha.name],
            list(add.output),
            name=f"{add.name}/PRelu",
        )
        removed_names.update(
            node.name for node in (relu, abs_node, sub, alpha_mul, half_mul, add)
        )

    rewritten_nodes = []
    for node in model.graph.node:
        if node.name in replacements:
            rewritten_nodes.append(replacements[node.name])
        elif node.name not in removed_names:
            rewritten_nodes.append(node)
    del model.graph.node[:]
    model.graph.node.extend(rewritten_nodes)
    return len(replacements)


def set_batch_one(model: onnx.ModelProto) -> None:
    for value in (*model.graph.input, *model.graph.output):
        batch = value.type.tensor_type.shape.dim[0]
        batch.ClearField("dim_param")
        batch.dim_value = 1


def make_implicit_conv_padding_explicit(model: onnx.ModelProto) -> int:
    """Write ONNX's default zero padding explicitly for CoreML conversion."""
    updated = 0
    for node in model.graph.node:
        if node.op_type != "Conv":
            continue
        attributes = {attribute.name for attribute in node.attribute}
        if "pads" not in attributes and "auto_pad" not in attributes:
            node.attribute.append(helper.make_attribute("pads", [0, 0, 0, 0]))
            updated += 1
    return updated


def remove_redundant_output_normalization(model: onnx.ModelProto) -> int:
    """Remove output L2 normalization because the Rust caller repeats it."""
    graph_outputs = {value.name for value in model.graph.output}
    rewritten_nodes = []
    replaced = 0
    for node in model.graph.node:
        if node.op_type == "LpNormalization" and any(
            output in graph_outputs for output in node.output
        ):
            rewritten_nodes.append(
                helper.make_node(
                    "Identity",
                    [node.input[0]],
                    list(node.output),
                    name=f"{node.name}/CallerNormalized",
                )
            )
            replaced += 1
        else:
            rewritten_nodes.append(node)
    del model.graph.node[:]
    model.graph.node.extend(rewritten_nodes)
    return replaced


def optimize_with_ort(model: onnx.ModelProto, output_path: Path) -> onnx.ModelProto:
    """Use ORT's portable basic optimizer to fold static shape subgraphs."""
    unoptimized_path = output_path.with_suffix(".unoptimized.onnx")
    onnx.save(model, unoptimized_path)
    try:
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        options.optimized_model_filepath = str(output_path)
        ort.InferenceSession(
            str(unoptimized_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
    finally:
        unoptimized_path.unlink(missing_ok=True)

    optimized = onnx.load(output_path)
    onnx.checker.check_model(optimized)
    return optimized


def describe(path: Path, model: onnx.ModelProto) -> dict[str, object]:
    def shapes(values: list[onnx.ValueInfoProto]) -> dict[str, list[int | str]]:
        return {
            value.name: [
                dimension.dim_value or dimension.dim_param
                for dimension in value.type.tensor_type.shape.dim
            ]
            for value in values
        }

    return {
        "path": str(path),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "nodes": len(model.graph.node),
        "operators": dict(
            sorted(Counter(node.op_type for node in model.graph.node).items())
        ),
        "inputs": shapes(list(model.graph.input)),
        "outputs": shapes(list(model.graph.output)),
    }


def build_models(source_dir: Path, output_dir: Path) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)

    yolo = load_source_model(source_dir, YOLO_SOURCE, YOLO_SOURCE_SHA256)
    set_batch_one(yolo)
    yolo_path = output_dir / YOLO_OUTPUT
    yolo = optimize_with_ort(yolo, yolo_path)

    face = load_source_model(source_dir, FACE_SOURCE, FACE_SOURCE_SHA256)
    if rewrite_prelu_decompositions(face) != 33:
        raise RuntimeError("expected exactly 33 MobileFaceNet PReLU rewrites")
    set_batch_one(face)
    if make_implicit_conv_padding_explicit(face) != 2:
        raise RuntimeError("expected exactly two implicit MobileFaceNet Conv pads")
    if remove_redundant_output_normalization(face) != 1:
        raise RuntimeError("expected one output MobileFaceNet LpNormalization")
    face_path = output_dir / FACE_OUTPUT
    face = optimize_with_ort(face, face_path)

    return {
        "yolo_static_b1": describe(yolo_path, yolo),
        "mobilefacenet_prelu_static_b1": describe(face_path, face),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    manifest = build_models(args.source_dir, args.output_dir)
    (args.output_dir / "model_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
