// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "RelistenAudioPlayerBackendSupport",
    platforms: [
        .iOS(.v18),
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
                "PlaybackErrorModel.swift",
                "GaplessMP3PlayerBackendNextCommand.swift",
                "GaplessMP3PlayerBackendPlaySupersession.swift",
                "GaplessMP3PlayerBackendNextIntent.swift",
                "GaplessMP3PlayerBackendResumeCommand.swift",
                "GaplessMP3PlayerBackendSeekCommand.swift",
                "MediaCenterPresentationDecision.swift",
                "NativeRemoteControlForwardingPolicy.swift",
                "RemoteCommandSeekPolicy.swift",
                "NowPlayingElapsedWritePolicy.swift",
                "PlaybackPresentationRevisionGate.swift",
            ]
        ),
        .testTarget(
            name: "GaplessMP3PlayerBackendSupportTests",
            dependencies: ["GaplessMP3PlayerBackendSupport"],
            path: "ios/Tests/GaplessMP3PlayerBackendSupportTests"
        ),
    ]
)
