# Custom ONNX Runtime binaries

The mobile apps use Ente's pinned custom ONNX Runtime 1.27.0 packaging build:

- Android: WebGPU, XNNPACK, and CPU; ARM64, ARMv7, and x86_64
- iOS: CoreML and CPU; iOS 15.1+ device and ARM64 Simulator

The release tag, asset names, and SHA-256 digests are defined once in
`version.properties`; the prepare scripts and the Android Gradle builds all
read from it. To bump the release, update only that file.

Android's AAR is downloaded by `prepare-android.sh` into the Gradle user cache.
iOS's XCFramework ZIP is downloaded by `prepare-ios.sh`; the selected static
archive slice is then bundled by the Rust build. Both downloads are verified
against the SHA-256 digests published with the release.

Desktop ONNX Runtime packaging is intentionally unchanged.

## WebGPU rollout status

On Android, the WebGPU execution provider is opt-in at runtime
(`set_ml_execution_config` in the Rust ML bindings; the photos app currently
enables it for internal users only) and is additionally restricted to
Android 12+ (SDK 31). All other devices use the XNNPACK/CPU chain.

## Building the Rust photos crate for iOS outside Xcode

The iOS `ort` dependency no longer downloads prebuilt binaries; the Cargokit
build exports `ORT_LIB_PATH` pointing at the custom static archive. For direct
`cargo` invocations against an iOS target (for example `cargo check`), export
it manually:

```sh
ORT_LIB_PATH="$(sh mobile/native/onnxruntime/prepare-ios.sh \
  "$HOME/Library/Caches/io.ente/onnxruntime" iphoneos)" \
IPHONEOS_DEPLOYMENT_TARGET=15.1 \
cargo check -p ente-photos --target aarch64-apple-ios
```

Use `iphonesimulator` and `--target aarch64-apple-ios-sim` for the Simulator.
The deployment target must be at least 15.1 to match the archive.
