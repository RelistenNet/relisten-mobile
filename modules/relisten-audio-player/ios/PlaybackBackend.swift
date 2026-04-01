import Foundation
import ExpoModulesCore

public struct RelistenGaplessStreamable: Sendable {
    let url: URL
    let identifier: String
    let cacheKey: String
    let title: String
    let artist: String
    let albumTitle: String
    let albumArt: String

    let downloadDestination: URL?
}

public enum PlaybackState: String, Enumerable {
    case Stopped
    case Playing
    case Paused
    case Stalled
}

protocol PlaybackBackendDelegate: AnyObject {
    func errorStartingStream(error: PlaybackStreamError, forStreamable: RelistenGaplessStreamable)
    func playbackStateChanged(newPlaybackState: PlaybackState)
    func playbackProgressChanged(elapsed: TimeInterval?, duration: TimeInterval?)
    func downloadProgressChanged(forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64)
    func trackChanged(previousStreamable: RelistenGaplessStreamable?, currentStreamable: RelistenGaplessStreamable?)
    func remoteControl(method: String)
    func streamingCacheCompleted(forStreamable streamable: RelistenGaplessStreamable, bytesWritten: Int)
    func audioSessionWasSetup()
}

struct PlaybackBackendProgressSnapshot {
    let elapsed: TimeInterval?
    let duration: TimeInterval?
    let activeTrackDownloadedBytes: UInt64?
    let activeTrackTotalBytes: UInt64?
}

protocol PlaybackBackend: AnyObject {
    var delegate: PlaybackBackendDelegate? { get set }
    var currentDurationSnapshot: TimeInterval? { get }
    var currentStateSnapshot: PlaybackState { get }
    var currentStateString: String { get }
    var elapsedSnapshot: TimeInterval? { get }
    var volume: Float { get set }

    func enqueuePrepareAudioSession()
    func requestPlaybackProgress(_ completion: @escaping (PlaybackBackendProgressSnapshot) -> Void)
    func enqueuePlay(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?, completion: @escaping () -> Void)
    func enqueueSetNextStream(_ streamable: RelistenGaplessStreamable?)
    func enqueueSetRepeatMode(_ repeatMode: Int)
    func enqueueSetShuffleMode(_ shuffleMode: Int)
    func enqueueResume(_ completion: @escaping () -> Void)
    func enqueuePause(_ completion: @escaping () -> Void)
    func enqueueStop(_ completion: @escaping () -> Void)
    func enqueueNext(_ completion: @escaping () -> Void)
    func enqueueSeekTo(percent: Double, completion: @escaping () -> Void)
    func enqueueSeekToTime(_ timeMs: Int64, completion: @escaping () -> Void)
    func teardown()
}
