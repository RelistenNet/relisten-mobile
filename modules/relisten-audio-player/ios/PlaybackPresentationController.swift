import Foundation
import MediaPlayer
import UIKit

private let presentationLog = RelistenPlaybackLogger(layer: .backend, category: .state)
private let nowPlayingElapsedWritePolicy = NowPlayingElapsedWritePolicy(interval: 5)

private func nowPlayingRateDescription(_ nowPlayingInfo: [String: Any]) -> String {
    if let rate = nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] as? Float {
        return String(format: "%.2f", rate)
    }
    return "-"
}

private func nowPlayingElapsedDescription(_ nowPlayingInfo: [String: Any]) -> String {
    if let elapsed = nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? TimeInterval {
        return String(format: "%.3f", elapsed)
    }
    return "-"
}

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
    private static let writeQueueSpecificKey = DispatchSpecificKey<String>()

    struct Snapshot {
        var title: String
        var artist: String
        var album: String
        var duration: TimeInterval?
        var elapsed: TimeInterval?
        var rate: Float
        var artworkURL: URL?
    }

    private struct SnapshotIdentity: Equatable {
        let title: String
        let artist: String
        let album: String
        let duration: TimeInterval?
        let hasElapsed: Bool
        let rate: Float
        let artworkURL: URL?

        init(_ snapshot: Snapshot) {
            title = snapshot.title
            artist = snapshot.artist
            album = snapshot.album
            duration = snapshot.duration
            hasElapsed = snapshot.elapsed != nil
            rate = snapshot.rate
            artworkURL = snapshot.artworkURL
        }
    }

    private struct State {
        var latestNowPlayingInfo: [String: Any] = [:]
        var latestSnapshotIdentity: SnapshotIdentity?
        var latestElapsedWriteAnchor: NowPlayingElapsedWriteAnchor?
        var artworkURL: URL?
        var artwork: MPMediaItemArtwork?
        var artworkRequestID: UInt64 = 0
        // One revision gates the whole Now Playing dictionary so a stale queued
        // artwork completion cannot mix old artwork with a newer transport rate.
        var presentationRevisionGate = PlaybackPresentationRevisionGate()
        var inFlightArtworkURLs: Set<URL> = []
        var isFrozen = false
    }

    private let lock = NSLock()
    private let artworkCache: ArtworkURLCache<MPMediaItemArtwork>
    private let urlSession: URLSession
    private let writeQueue = DispatchQueue(label: "net.relisten.ios.media-center-presentation")
    private let writeQueueSpecificValue = UUID().uuidString
    private var state = State()

    init(artworkCacheCapacity: Int = 2, urlSession: URLSession = .shared) {
        self.artworkCache = ArtworkURLCache(capacity: artworkCacheCapacity)
        self.urlSession = urlSession
        writeQueue.setSpecific(
            key: Self.writeQueueSpecificKey,
            value: writeQueueSpecificValue
        )
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
        let now = ProcessInfo.processInfo.systemUptime
        let snapshotIdentity = SnapshotIdentity(snapshot)

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
        let wasFrozen = state.isFrozen
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

        let shouldWrite = freezeAfterApply
            || wasFrozen
            || state.latestSnapshotIdentity != snapshotIdentity
            || nowPlayingElapsedWritePolicy.shouldWrite(
                elapsed: snapshot.elapsed,
                rate: snapshot.rate,
                latestAnchor: state.latestElapsedWriteAnchor,
                now: now
            )

        if !shouldWrite {
            state.latestNowPlayingInfo = nowPlayingInfo
            lock.unlock()

            if let artworkRequest {
                fetchArtwork(from: artworkRequest.url, requestID: artworkRequest.requestID)
            }
            return
        }

        let revision = state.presentationRevisionGate.advance()
        state.latestNowPlayingInfo = nowPlayingInfo
        state.latestSnapshotIdentity = snapshotIdentity
        state.latestElapsedWriteAnchor = nowPlayingElapsedWritePolicy.anchor(
            elapsed: snapshot.elapsed,
            rate: snapshot.rate,
            now: now
        )
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

        writeNowPlayingInfo(nowPlayingInfo: nowPlayingInfo, revision: revision)

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
        state.latestSnapshotIdentity = nil
        state.latestElapsedWriteAnchor = nil
        state.artworkURL = nil
        state.artwork = nil
        state.artworkRequestID &+= 1
        let revision = state.presentationRevisionGate.advance()
        lock.unlock()

        performPresentationWrite(revision: revision) {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            presentationLog.info(
                "cleared",
                "now playing info",
                playbackLogIntegerField("rev", revision)
            )
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
                self.state.latestElapsedWriteAnchor = nowPlayingElapsedWritePolicy.anchor(
                    elapsed: updatedInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? TimeInterval,
                    rate: updatedInfo[MPNowPlayingInfoPropertyPlaybackRate] as? Float ?? 0,
                    now: ProcessInfo.processInfo.systemUptime
                )
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
            self.writeNowPlayingInfo(nowPlayingInfo: nowPlayingInfo, revision: revision)
        }.resume()
    }

    private func writeNowPlayingInfo(
        nowPlayingInfo: [String: Any],
        revision: UInt64
    ) {
        performPresentationWrite(revision: revision) {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
            presentationLog.info(
                "wrote",
                "now playing info",
                playbackLogIntegerField("rev", revision),
                playbackLogField("rate", nowPlayingRateDescription(nowPlayingInfo)),
                playbackLogField("elapsed", nowPlayingElapsedDescription(nowPlayingInfo))
            )
        }
    }

    private func performPresentationWrite(revision: UInt64, _ write: @escaping () -> Void) {
        let applyIfCurrent = {
            guard self.isCurrentPresentationRevision(revision) else {
                presentationLog.info(
                    "skipped",
                    "stale presentation write",
                    playbackLogIntegerField("rev", revision)
                )
                return
            }
            write()
        }

        // Remote command handlers can run on the main thread while the backend
        // mutation happens on `backendQueue`. The write must still finish before
        // returning Success to MediaRemote, so this queue is synchronous and
        // serial instead of a main-queue async hop. Serializing also preserves
        // the revision gate: old artwork/status writes cannot land after newer
        // transport-rate snapshots.
        if DispatchQueue.getSpecific(key: Self.writeQueueSpecificKey) == writeQueueSpecificValue {
            applyIfCurrent()
        } else {
            writeQueue.sync(execute: applyIfCurrent)
        }
    }

    private func isCurrentPresentationRevision(_ revision: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return state.presentationRevisionGate.shouldApply(revision)
    }
}
