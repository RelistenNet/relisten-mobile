import Foundation
import MediaPlayer
import UIKit

private final class ArtworkURLCache<Value> {
    private let capacity: Int
    private var values: [URL: Value] = [:]
    private var orderedKeys: [URL] = []

    init(capacity: Int) {
        self.capacity = max(0, capacity)
    }

    func value(forKey key: URL) -> Value? {
        guard let value = values[key] else {
            return nil
        }

        touch(key)
        return value
    }

    func setValue(_ value: Value, forKey key: URL) {
        guard capacity > 0 else {
            values.removeAll()
            orderedKeys.removeAll()
            return
        }

        values[key] = value
        touch(key)

        while orderedKeys.count > capacity {
            let evictedKey = orderedKeys.removeFirst()
            values.removeValue(forKey: evictedKey)
        }
    }

    private func touch(_ key: URL) {
        orderedKeys.removeAll { $0 == key }
        orderedKeys.append(key)
    }
}

final class PlaybackPresentationController {
    private struct State {
        var latestNowPlayingInfo: [String: Any] = [:]
        var artworkURL: URL?
        var artwork: MPMediaItemArtwork?
        var artworkRequestID: UInt64 = 0
        var inFlightArtworkURLs: Set<URL> = []
    }

    private let lock = NSLock()
    private let artworkCache: ArtworkURLCache<MPMediaItemArtwork>
    private let urlSession: URLSession
    private var state = State()

    init(artworkCacheCapacity: Int = 2, urlSession: URLSession = .shared) {
        self.artworkCache = ArtworkURLCache(capacity: artworkCacheCapacity)
        self.urlSession = urlSession
    }

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
            if let currentArtwork = state.artwork {
                cachedArtwork = currentArtwork
            } else if let artworkURL, let cached = artworkCache.value(forKey: artworkURL) {
                state.artwork = cached
                cachedArtwork = cached
            } else if let artworkURL, !state.inFlightArtworkURLs.contains(artworkURL) {
                state.inFlightArtworkURLs.insert(artworkURL)
                artworkRequest = (artworkURL, state.artworkRequestID)
            }
        } else {
            state.artworkURL = artworkURL
            state.artwork = nil
            state.artworkRequestID &+= 1
            if let artworkURL, let cached = artworkCache.value(forKey: artworkURL) {
                state.artwork = cached
                cachedArtwork = cached
            } else if let artworkURL, !state.inFlightArtworkURLs.contains(artworkURL) {
                state.inFlightArtworkURLs.insert(artworkURL)
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
        urlSession.dataTask(with: url) { [weak self] data, _, _ in
            guard let self else { return }

            let artwork = data
                .flatMap(UIImage.init(data:))
                .map { image in
                    MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                }
            var nowPlayingInfo: [String: Any]?

            self.lock.lock()
            self.state.inFlightArtworkURLs.remove(url)
            guard let artwork else {
                self.lock.unlock()
                return
            }
            self.artworkCache.setValue(artwork, forKey: url)
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
