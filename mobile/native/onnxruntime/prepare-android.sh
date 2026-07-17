#!/bin/sh
set -eu

asset_name="onnxruntime-webgpu-android-1.27.0-pilot.5.aar"
asset_url="https://github.com/laurens-pilot/ort-packaging/releases/download/ort-1.27.0-webgpu-pilot.5/$asset_name"
expected_sha256="f40ef31bb6ff8399c556872bcad272bddb650b0845f3026c56a065de9b1ec579"

destination=${1:?"usage: prepare-android.sh <destination.aar>"}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "A SHA-256 utility (sha256sum or shasum) is required" >&2
    exit 1
  fi
}

if [ -f "$destination" ] && [ "$(sha256_file "$destination")" = "$expected_sha256" ]; then
  exit 0
fi

mkdir -p "$(dirname "$destination")"
temporary_file="$destination.download.$$"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

curl --fail --location --retry 3 --silent --show-error \
  --output "$temporary_file" \
  "$asset_url"

actual_sha256=$(sha256_file "$temporary_file")
if [ "$actual_sha256" != "$expected_sha256" ]; then
  echo "SHA-256 mismatch for $asset_name: got $actual_sha256, expected $expected_sha256" >&2
  exit 1
fi

mv "$temporary_file" "$destination"
trap - EXIT HUP INT TERM
