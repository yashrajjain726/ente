#!/bin/sh
set -eu

asset_name="onnxruntime-coreml-ios-1.27.0-pilot.5.zip"
asset_url="https://github.com/laurens-pilot/ort-packaging/releases/download/ort-1.27.0-webgpu-pilot.5/$asset_name"
expected_sha256="fc820547f8e328ed501112be06b23d26329676d4e6a78978fc64971f8f05555d"

cache_root=${1:?"usage: prepare-ios.sh <cache-root> <iphoneos|iphonesimulator>"}
platform=${2:?"usage: prepare-ios.sh <cache-root> <iphoneos|iphonesimulator>"}

case "$platform" in
  iphoneos)
    xcframework_slice="ios-arm64"
    ;;
  iphonesimulator)
    xcframework_slice="ios-arm64-simulator"
    ;;
  *)
    echo "Unsupported iOS platform: $platform" >&2
    exit 1
    ;;
esac

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "A SHA-256 utility (shasum or sha256sum) is required" >&2
    exit 1
  fi
}

asset_cache="$cache_root/ort-1.27.0-webgpu-pilot.5"
archive="$asset_cache/$asset_name"
extract_root="$asset_cache/$expected_sha256"
verified_marker="$extract_root/.verified"
temporary_file=""
temporary_extract=""
temporary_library=""

cleanup() {
  if [ -n "$temporary_file" ]; then
    rm -f "$temporary_file"
  fi
  if [ -n "$temporary_extract" ]; then
    rm -rf "$temporary_extract"
  fi
  if [ -n "$temporary_library" ]; then
    rm -f "$temporary_library"
  fi
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$asset_cache"
if [ ! -f "$archive" ] || [ "$(sha256_file "$archive")" != "$expected_sha256" ]; then
  temporary_file="$archive.download.$$"
  curl --fail --location --retry 3 --silent --show-error \
    --output "$temporary_file" \
    "$asset_url"

  actual_sha256=$(sha256_file "$temporary_file")
  if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "SHA-256 mismatch for $asset_name: got $actual_sha256, expected $expected_sha256" >&2
    exit 1
  fi

  mv "$temporary_file" "$archive"
  temporary_file=""
fi

framework_binary="$extract_root/onnxruntime.xcframework/$xcframework_slice/onnxruntime.framework/onnxruntime"
if [ ! -f "$verified_marker" ] || [ ! -f "$framework_binary" ]; then
  temporary_extract="$extract_root.extract.$$"
  mkdir -p "$temporary_extract"
  unzip -q "$archive" -d "$temporary_extract"

  extracted_binary="$temporary_extract/onnxruntime.xcframework/$xcframework_slice/onnxruntime.framework/onnxruntime"
  if [ ! -f "$extracted_binary" ]; then
    echo "The $xcframework_slice ONNX Runtime archive is missing from $asset_name" >&2
    exit 1
  fi

  printf '%s\n' "$expected_sha256" > "$temporary_extract/.verified"
  rm -rf "$extract_root"
  mv "$temporary_extract" "$extract_root"
  temporary_extract=""
fi

library_dir="$extract_root/static-lib/$xcframework_slice"
mkdir -p "$library_dir"
library="$library_dir/libonnxruntime.a"
if [ ! -f "$library" ] || [ -L "$library" ]; then
  temporary_library="$library.thin.$$"
  xcrun lipo "$framework_binary" -thin arm64 -output "$temporary_library"
  mv "$temporary_library" "$library"
  temporary_library=""
fi
printf '%s\n' "$library_dir"
