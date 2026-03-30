// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "GaplessMP3PlayerHarness",
    platforms: [
        .macOS(.v13),
        .iOS(.v18),
    ],
    products: [
        .executable(
            name: "GaplessMP3PlayerHarness",
            targets: ["GaplessMP3PlayerHarness"]
        ),
    ],
    targets: [
        .target(
            name: "GaplessMP3Player",
            path: "Sources/GaplessMP3Player"
        ),
        .executableTarget(
            name: "GaplessMP3PlayerHarness",
            dependencies: ["GaplessMP3Player"]
        ),
    ]
)
