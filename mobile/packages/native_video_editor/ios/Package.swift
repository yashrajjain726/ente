// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "EnteVideoCore",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
    ],
    products: [
        .library(name: "EnteVideoCore", targets: ["EnteVideoCore"])
    ],
    targets: [
        .target(
            name: "EnteVideoCore",
            path: "Classes",
            exclude: ["NativeVideoEditorPlugin.swift"]
        ),
        .testTarget(
            name: "EnteVideoCoreTests",
            dependencies: ["EnteVideoCore"],
            path: "Tests"
        ),
    ],
    swiftLanguageVersions: [.v5]
)
