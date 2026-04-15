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
        // MPNowPlayingInfoCenter writes are always dispatched to the main thread.
        // Revisions make those queued writes latest-wins, including same-track
        // pause/play updates where artworkURL and requestID do not change.
        var nowPlayingRevisionGate = PlaybackPresentationRevisionGate()
        var playbackStateRevisionGate = PlaybackPresentationRevisionGate()
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
        // Playback state is separate from nowPlayingInfo playbackRate, but both
        // are visible on the lock screen. A stale queued state write can make
        // audio look paused while it is still playing, so it gets its own gate.
        lock.lock()
        let revision = self.state.playbackStateRevisionGate.advance()
        lock.unlock()

        DispatchQueue.main.async {
            guard self.isCurrentPlaybackStateRevision(revision) else { return }
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
        let revision = state.nowPlayingRevisionGate.advance()
        state.latestNowPlayingInfo = nowPlayingInfo
        lock.unlock()

        updateNowPlayingInfoOnMain(nowPlayingInfo, revision: revision)

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
        let revision = state.nowPlayingRevisionGate.advance()
        lock.unlock()

        DispatchQueue.main.async {
            guard self.isCurrentNowPlayingRevision(revision) else { return }
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
            var revision: UInt64?

            self.lock.lock()
            self.state.inFlightArtworkURLs.remove(url)
            guard let artwork else {
                self.lock.unlock()
                return
            }
            self.artworkCache.setValue(artwork, forKey: url)
            // Ignore late artwork fetches once a newer track has replaced this
            // request; if it is still current, merge artwork into the newest
            // dictionary instead of resurrecting the dictionary from request time.
            if self.state.artworkRequestID == requestID, self.state.artworkURL == url {
                self.state.artwork = artwork
                var updatedInfo = self.state.latestNowPlayingInfo
                updatedInfo[MPMediaItemPropertyArtwork] = artwork
                self.state.latestNowPlayingInfo = updatedInfo
                nowPlayingInfo = updatedInfo
                revision = self.state.nowPlayingRevisionGate.advance()
            }
            self.lock.unlock()

            guard let nowPlayingInfo, let revision else { return }
            self.updateNowPlayingInfoOnMain(nowPlayingInfo, revision: revision)
        }.resume()
    }

    private func updateNowPlayingInfoOnMain(_ nowPlayingInfo: [String: Any], revision: UInt64) {
        DispatchQueue.main.async {
            // Now Playing writes are queued on the main thread; revision checks
            // keep an older same-track pause/update from overwriting newer state.
            guard self.isCurrentNowPlayingRevision(revision) else { return }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
    }

    private func isCurrentNowPlayingRevision(_ revision: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state.nowPlayingRevisionGate.shouldApply(revision)
    }

    private func isCurrentPlaybackStateRevision(_ revision: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state.playbackStateRevisionGate.shouldApply(revision)
    }
}
