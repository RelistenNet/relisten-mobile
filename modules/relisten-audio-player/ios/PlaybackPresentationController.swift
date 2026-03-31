import Foundation
import MediaPlayer
import UIKit

final class PlaybackPresentationController {
    private struct State {
        var latestNowPlayingInfo: [String: Any] = [:]
        var artworkURL: URL?
        var artwork: MPMediaItemArtwork?
        var artworkRequestID: UInt64 = 0
    }

    private let lock = NSLock()
    private var state = State()

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

    func updateNowPlaying(
        title: String?,
        artist: String?,
        album: String?,
        duration: TimeInterval?,
        elapsed: TimeInterval?,
        rate: Float,
        artworkURL: URL?
    ) {
        var nowPlayingInfo: [String: Any] = [
            MPNowPlayingInfoPropertyPlaybackRate: rate,
        ]
        if let title {
            nowPlayingInfo[MPMediaItemPropertyTitle] = title
        }
        if let artist {
            nowPlayingInfo[MPMediaItemPropertyArtist] = artist
        }
        if let album {
            nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = album
        }
        if let duration {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let elapsed {
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        }

        var cachedArtwork: MPMediaItemArtwork?
        var artworkRequest: (url: URL, requestID: UInt64)?

        lock.lock()
        if artworkURL == state.artworkURL {
            cachedArtwork = state.artwork
        } else {
            state.artworkURL = artworkURL
            state.artwork = nil
            state.artworkRequestID &+= 1
            if let artworkURL {
                artworkRequest = (artworkURL, state.artworkRequestID)
            }
        }

        if let cachedArtwork {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = cachedArtwork
        }
        state.latestNowPlayingInfo = nowPlayingInfo
        lock.unlock()

        updateNowPlayingInfoOnMain(nowPlayingInfo)

        if let artworkRequest {
            fetchArtwork(from: artworkRequest.url, requestID: artworkRequest.requestID)
        }
    }

    func clearNowPlaying() {
        lock.lock()
        state.latestNowPlayingInfo = [:]
        state.artworkURL = nil
        state.artwork = nil
        state.artworkRequestID &+= 1
        lock.unlock()

        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        }
    }

    func teardown() {
        clearNowPlaying()
    }

    private func fetchArtwork(from url: URL, requestID: UInt64) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let image = UIImage(data: data) else { return }

            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            var nowPlayingInfo: [String: Any]?

            self.lock.lock()
            // Ignore late artwork fetches once a newer track has replaced this request.
            if self.state.artworkRequestID == requestID, self.state.artworkURL == url {
                self.state.artwork = artwork
                var updatedInfo = self.state.latestNowPlayingInfo
                updatedInfo[MPMediaItemPropertyArtwork] = artwork
                self.state.latestNowPlayingInfo = updatedInfo
                nowPlayingInfo = updatedInfo
            }
            self.lock.unlock()

            guard let nowPlayingInfo else { return }
            self.updateNowPlayingInfoOnMain(nowPlayingInfo)
        }.resume()
    }

    private func updateNowPlayingInfoOnMain(_ nowPlayingInfo: [String: Any]) {
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
    }
}
