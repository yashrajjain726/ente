#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export RUSTFLAGS="-D warnings"

python3 checks/cargo-versions/check.py ..
python3 checks/cargo-versions/test.py
python3 checks/cargo-workspace-dependencies/check.py ..
python3 checks/cargo-workspace-dependencies/test.py
node checks/binding-boundary/check.mjs ..
node checks/binding-boundary/test.mjs
cargo fmt --check
cargo clippy --locked --all-targets --features museum,ente-ml/ml-assets
cargo audit
