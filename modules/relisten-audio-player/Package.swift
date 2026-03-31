// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "RelistenAudioPlayerBackendSupport",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "GaplessMP3PlayerBackendSupport",
            targets: ["GaplessMP3PlayerBackendSupport"]
        ),
    ],
    targets: [
        .target(
            name: "GaplessMP3PlayerBackendSupport",
            path: "ios/BackendSupport",
            sources: [
                "GaplessMP3PlayerBackendPlaySupersession.swift",
                "GaplessMP3PlayerBackendNextIntent.swift",
            ]
        ),
        .testTarget(
            name: "GaplessMP3PlayerBackendSupportTests",
            dependencies: ["GaplessMP3PlayerBackendSupport"],
            path: "Tests/GaplessMP3PlayerBackendSupportTests"
        ),
    ]
)
