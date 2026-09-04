#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

node .github/checks/documentation-comments/check.mjs
node .github/checks/documentation-comments/test.mjs
