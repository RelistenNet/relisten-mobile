import Foundation

enum PlaybackBackendSelection {
    static let USE_NATIVE_GAPLESS_MP3_BACKEND = true
}

func makePlaybackBackend() -> PlaybackBackend {
    if PlaybackBackendSelection.USE_NATIVE_GAPLESS_MP3_BACKEND {
        return GaplessMP3PlayerBackend()
    }

    fatalError("Only the GaplessMP3PlayerBackend is available")
}
