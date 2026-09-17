#!/bin/bash
set -eo pipefail

cd "$(dirname "$0")/.."

swift format lint --recursive --strict .
swift package plugin --allow-writing-to-package-directory swiftlint lint --strict
