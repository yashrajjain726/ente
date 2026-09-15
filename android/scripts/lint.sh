#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 checks/gradle-order/check.py .
python3 checks/gradle-order/test.py

(cd ../rust && cargo codegen native)
./gradlew :lint
