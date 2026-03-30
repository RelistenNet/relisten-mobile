import MediaPlayer

final class PlaybackPresentationController {
    func setPlaybackState(_ state: PlaybackState) {
        DispatchQueue.main.async {
            switch state {
            case .Playing:
                MPNowPlayingInfoCenter.default().playbackState = .playing
            case .Paused:
                MPNowPlayingInfoCenter.default().playbackState = .paused
            case .Stalled:
                MPNowPlayingInfoCenter.default().playbackState = .interrupted
            default:
                MPNowPlayingInfoCenter.default().playbackState = .stopped
            }
        }
    }

    func teardown() {}
}
