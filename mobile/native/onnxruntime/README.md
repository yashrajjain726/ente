# Custom ONNX Runtime binaries

The mobile apps use Ente's pinned custom ONNX Runtime 1.27.0 packaging build:

- Release: `ort-1.27.0-webgpu-pilot.5`
- Android: WebGPU, XNNPACK, and CPU; ARM64, ARMv7, and x86_64
- iOS: CoreML and CPU; iOS 15.1+ device and ARM64 Simulator

Android's AAR is downloaded by `prepare-android.sh` into the Gradle user cache.
iOS's XCFramework ZIP is downloaded by `prepare-ios.sh`; the selected static
archive slice is then bundled by the Rust build. Both downloads are pinned to
the SHA-256 digests published with the release.

Desktop ONNX Runtime packaging is intentionally unchanged.
