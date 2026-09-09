#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

node .github/checks/documentation-comments/check.mjs
node .github/checks/documentation-comments/test.mjs
ruby .github/checks/workflow-paths/check.rb
ruby .github/checks/workflow-paths/test.rb
node .github/checks/wasm-ci-paths/check.mjs
node --test .github/checks/wasm-ci-paths/test.mjs
node --test .github/scripts/ci/test.mjs
