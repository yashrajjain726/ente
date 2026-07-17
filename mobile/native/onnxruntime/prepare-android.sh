#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
properties_file="$script_dir/version.properties"

read_property() {
  sed -n "s/^$1=//p" "$properties_file" | head -n 1
}

base_url=$(read_property ortReleaseBaseUrl)
release=$(read_property ortRelease)
asset_name=$(read_property ortAndroidAsset)
expected_sha256=$(read_property ortAndroidSha256)
if [ -z "$base_url" ] || [ -z "$release" ] || [ -z "$asset_name" ] || [ -z "$expected_sha256" ]; then
  echo "Failed to read the ONNX Runtime release from $properties_file" >&2
  exit 1
fi
asset_url="$base_url/$release/$asset_name"

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
