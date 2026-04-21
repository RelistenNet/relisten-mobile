import Foundation
import MediaPlayer
import UIKit

private let presentationLog = RelistenPlaybackLogger(layer: .backend, category: .state)

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
    struct Snapshot {
        var title: String
        var artist: String
        var album: String
        var duration: TimeInterval?
        var elapsed: TimeInterval?
        var rate: Float
        var artworkURL: URL?
        var mediaCenterPlaybackState: MPNowPlayingPlaybackState
    }

    private struct State {
        var latestNowPlayingInfo: [String: Any] = [:]
        var latestPlaybackState: MPNowPlayingPlaybackState = .stopped
        var artworkURL: URL?
        var artwork: MPMediaItemArtwork?
        var artworkRequestID: UInt64 = 0
        // MPNowPlayingInfoCenter writes are always dispatched to the main thread.
        // One revision gates the paired metadata + playback-state write so a
        // stale queued block cannot mix old rate/artwork with new transport state.
        var presentationRevisionGate = PlaybackPresentationRevisionGate()
        var inFlightArtworkURLs: Set<URL> = []
        var isFrozen = false
    }

    private let lock = NSLock()
    private let artworkCache: ArtworkURLCache<MPMediaItemArtwork>
    private let urlSession: URLSession
    private var state = State()

    init(artworkCacheCapacity: Int = 2, urlSession: URLSession = .shared) {
        self.artworkCache = ArtworkURLCache(capacity: artworkCacheCapacity)
        self.urlSession = urlSession
    }

    func apply(_ snapshot: Snapshot?) {
        guard let snapshot else {
            applyClear()
            return
        }

        applySnapshot(snapshot, freezeAfterApply: false)
    }

    func applyAndFreeze(_ snapshot: Snapshot) {
        // Interruption begin needs one final coherent Relisten snapshot, then
        // subsequent delayed status/artwork writes should be ignored until iOS
        // grants resume or we decide to suppress for external media.
        applySnapshot(snapshot, freezeAfterApply: true)
    }

    private func applySnapshot(_ snapshot: Snapshot, freezeAfterApply: Bool) {
        // Keep playback state, rate, elapsed anchor, and metadata in one
        // dictionary/revision. Splitting these writes is what made the lock
        // screen show stale play/pause/rate combinations.
        var nowPlayingInfo: [String: Any] = [
            MPNowPlayingInfoPropertyPlaybackRate: snapshot.rate,
            MPMediaItemPropertyTitle: snapshot.title,
            MPMediaItemPropertyArtist: snapshot.artist,
            MPMediaItemPropertyAlbumTitle: snapshot.album,
        ]
        if let duration = snapshot.duration {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let elapsed = snapshot.elapsed {
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        }

        var cachedArtwork: MPMediaItemArtwork?
        var artworkRequest: (url: URL, requestID: UInt64)?

        lock.lock()
        state.isFrozen = false
        if snapshot.artworkURL == state.artworkURL {
            if let currentArtwork = state.artwork {
                cachedArtwork = currentArtwork
            } else if let artworkURL = snapshot.artworkURL, let cached = artworkCache.value(forKey: artworkURL) {
                state.artwork = cached
                cachedArtwork = cached
            } else if let artworkURL = snapshot.artworkURL, !state.inFlightArtworkURLs.contains(artworkURL) {
                state.inFlightArtworkURLs.insert(artworkURL)
                artworkRequest = (artworkURL, state.artworkRequestID)
            }
        } else {
            state.artworkURL = snapshot.artworkURL
            state.artwork = nil
            state.artworkRequestID &+= 1
            if let artworkURL = snapshot.artworkURL, let cached = artworkCache.value(forKey: artworkURL) {
                state.artwork = cached
                cachedArtwork = cached
            } else if let artworkURL = snapshot.artworkURL, !state.inFlightArtworkURLs.contains(artworkURL) {
                state.inFlightArtworkURLs.insert(artworkURL)
                artworkRequest = (artworkURL, state.artworkRequestID)
            }
        }

        if let cachedArtwork {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = cachedArtwork
        }
        let revision = state.presentationRevisionGate.advance()
        state.latestNowPlayingInfo = nowPlayingInfo
        state.latestPlaybackState = snapshot.mediaCenterPlaybackState
        state.isFrozen = freezeAfterApply
        if freezeAfterApply {
            // A frozen final interruption snapshot should not start a fresh
            // artwork fetch that can complete after another app has taken over.
            if let artworkRequest {
                state.inFlightArtworkURLs.remove(artworkRequest.url)
            }
            artworkRequest = nil
        }
        lock.unlock()

        updatePresentationOnMain(
            nowPlayingInfo: nowPlayingInfo,
            playbackState: snapshot.mediaCenterPlaybackState,
            revision: revision
        )

        if let artworkRequest {
            fetchArtwork(from: artworkRequest.url, requestID: artworkRequest.requestID)
        }
    }

    func freeze() {
        lock.lock()
        state.isFrozen = true
        let revision = state.presentationRevisionGate.advance()
        lock.unlock()

        presentationLog.debug(
            "froze",
            "media center presentation",
            playbackLogIntegerField("rev", revision)
        )
    }

    func teardown() {
        apply(nil)
    }

    private func applyClear() {
        // Clearing also advances the artwork request ID so an older completion
        // cannot rebuild a tile after suppression, stop, or teardown.
        lock.lock()
        state.isFrozen = false
        state.latestNowPlayingInfo = [:]
        state.latestPlaybackState = .stopped
        state.artworkURL = nil
        state.artwork = nil
        state.artworkRequestID &+= 1
        let revision = state.presentationRevisionGate.advance()
        lock.unlock()

        DispatchQueue.main.async {
            guard self.isCurrentPresentationRevision(revision) else { return }
            MPNowPlayingInfoCenter.default().playbackState = .stopped
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        }
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
                let isFrozen = self.state.isFrozen
                self.lock.unlock()
                presentationLog.debug(
                    "discarded",
                    "artwork completion",
                    playbackLogField("url", url.absoluteString),
                    playbackLogBoolField("frozen", isFrozen)
                )
                return
            }
            self.artworkCache.setValue(artwork, forKey: url)
            // Ignore late artwork fetches once a newer track has replaced this
            // request; if it is still current, merge artwork into the newest
            // dictionary instead of resurrecting the dictionary from request
            // time. Frozen writes are deliberately excluded so phone/Spotify
            // interruption windows cannot be reasserted by artwork.
            if !self.state.isFrozen, self.state.artworkRequestID == requestID, self.state.artworkURL == url {
                self.state.artwork = artwork
                var updatedInfo = self.state.latestNowPlayingInfo
                updatedInfo[MPMediaItemPropertyArtwork] = artwork
                self.state.latestNowPlayingInfo = updatedInfo
                nowPlayingInfo = updatedInfo
                revision = self.state.presentationRevisionGate.advance()
            }
            let frozen = self.state.isFrozen
            self.lock.unlock()

            guard let nowPlayingInfo, let revision else {
                presentationLog.debug(
                    frozen ? "frozen" : "discarded",
                    "artwork completion",
                    playbackLogField("url", url.absoluteString),
                    playbackLogIntegerField("req", requestID)
                )
                return
            }
            presentationLog.debug(
                "applied",
                "artwork completion",
                playbackLogField("url", url.absoluteString),
                playbackLogIntegerField("req", requestID),
                playbackLogIntegerField("rev", revision)
            )
            self.updatePresentationOnMain(
                nowPlayingInfo: nowPlayingInfo,
                playbackState: self.currentPlaybackState(),
                revision: revision
            )
        }.resume()
    }

    private func updatePresentationOnMain(
        nowPlayingInfo: [String: Any],
        playbackState: MPNowPlayingPlaybackState,
        revision: UInt64
    ) {
        DispatchQueue.main.async {
            guard self.isCurrentPresentationRevision(revision) else { return }
            MPNowPlayingInfoCenter.default().playbackState = playbackState
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
    }

    private func currentPlaybackState() -> MPNowPlayingPlaybackState {
        lock.lock()
        defer { lock.unlock() }
        return state.latestPlaybackState
    }

    private func isCurrentPresentationRevision(_ revision: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state.presentationRevisionGate.shouldApply(revision)
    }
}
