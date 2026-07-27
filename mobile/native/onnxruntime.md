# Custom ONNX Runtime binaries

Photos and Ensu use Ente's pinned ONNX Runtime 1.27.0 packaging build,
`ort-1.27.0-r3` from the ort-packaging repository.

## Consumers

- Android resolves `io.ente.onnxruntime:onnxruntime-webgpu-android` directly
  from the GitHub release and verifies its SHA-256 with Gradle. The AAR contains
  WebGPU, XNNPACK, and CPU support for ARM64, ARMv7, and x86_64.
- Photos on iOS uses the `EnteOnnxRuntime` pod as a verified downloader. The
  pod is deliberately not a vendored framework; `ente_photos_rust` links the
  selected static XCFramework archive through `ORT_LIB_PATH`.
- Ensu on iOS links the same static XCFramework through SwiftPM. Its Rust
  `ort-sys` dependency uses `disable-linking` so ONNX Runtime is linked once by
  the app.

## Updating the release

Use the digests in the release's `SHA256SUMS` asset and keep every mobile
consumer on the same packaging revision.

- iOS: update `Package.swift` and `EnteOnnxRuntime.podspec` in
  `mobile/native/apple/packages/EnteOnnxRuntime`, then run `pod install` in
  `mobile/apps/photos/ios` and commit the updated lockfile.
- Photos Android: update `mobile/apps/photos/android/app/build.gradle` and its
  `gradle/verification-metadata.xml`.
- Ensu Android: update
  `mobile/native/android/apps/ensu/rust/build.gradle.kts` and its
  `gradle/verification-metadata.xml`.

## Building Photos Rust directly for iOS

Xcode normally sets `ORT_LIB_PATH`. For a direct Cargo invocation, install the
Photos pods first and set it explicitly:

```sh
ORT_LIB_PATH="$PWD/mobile/apps/photos/ios/Pods/EnteOnnxRuntime/onnxruntime.xcframework/ios-arm64" \
IPHONEOS_DEPLOYMENT_TARGET=15.1 \
cargo check -p ente-photos --target aarch64-apple-ios
```

For an Apple Silicon Simulator build, use the `ios-arm64-simulator` slice and
the `aarch64-apple-ios-sim` Rust target.
