#!/bin/bash
set -eo pipefail

cd "$(dirname "$0")/.."

# TODO: Include Ensu.
git ls-files -z --cached --others --exclude-standard -- '*.swift' ':!:apps/ensu/**' |
    xargs -0 swift format lint --strict
swift package plugin --allow-writing-to-package-directory swiftlint lint --strict
