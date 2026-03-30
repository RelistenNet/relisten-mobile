import Foundation

let USE_NATIVE_GAPLESS_MP3_BACKEND = false

func makePlaybackBackend() -> PlaybackBackend {
    if USE_NATIVE_GAPLESS_MP3_BACKEND {
        assertionFailure("GaplessMP3PlayerBackend is not implemented yet; falling back to the BASS backend")
    }

    return RelistenGaplessAudioPlayer()
}
