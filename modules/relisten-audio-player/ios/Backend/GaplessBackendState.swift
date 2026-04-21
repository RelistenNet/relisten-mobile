import Foundation

final class BackendLockedValue<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value

    init(_ value: Value) {
        self.value = value
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func withValue<T>(_ body: (inout Value) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

struct GaplessBackendPendingStartTimeAfterPrepare {
    let generation: UInt64
    let milliseconds: Int64
}

struct GaplessBackendManualTrackChange: Sendable {
    let previous: RelistenGaplessStreamable?
    let current: RelistenGaplessStreamable?
}

struct GaplessBackendSnapshot {
    var currentDuration: TimeInterval?
    var elapsed: TimeInterval?
    var currentState: PlaybackState = .Stopped
    var volume: Float = 1.0
    var activeTrackDownloadedBytes: UInt64?
    var activeTrackTotalBytes: UInt64?
    var currentStreamable: RelistenGaplessStreamable?
    var nextStreamable: RelistenGaplessStreamable?
    var desiredNextStreamable: RelistenGaplessStreamable?
    var pendingStartTimeAfterPrepare: GaplessBackendPendingStartTimeAfterPrepare?
    var generation: UInt64 = 0
    var seekSequence: UInt64 = 0

    // These four fields are the presentation state machine.
    //
    // - desiredTransport: what the user or app is trying to do.
    // - renderStatus/renderIsPlaying: what the native engine is actually doing.
    // - systemSuspension: temporary system ownership such as calls or resets.
    // - mediaCenterWriteMode: whether Relisten may write the lock screen.
    //
    // Keeping those axes explicit prevents common iOS mistakes, especially
    // treating buffering as paused or stealing Media Center back from Spotify.
    var desiredTransport: MediaCenterDesiredTransport = .stopped
    var systemSuspension: MediaCenterSystemSuspension = .none
    var mediaCenterWriteMode: MediaCenterWriteMode = .active
    var resumeStartedAtUptime: TimeInterval?
    var renderStatus: MediaCenterRenderStatus = .stopped
    var renderIsPlaying = false

    var currentSessionID: String?
    var isPreparingCurrentTrack = false
    var progressPollingGeneration: UInt64?
}

extension MediaCenterRenderStatus {
    init(playbackPhase: GaplessPlaybackPhase) {
        switch playbackPhase {
        case .stopped:
            self = .stopped
        case .preparing:
            self = .preparing
        case .paused:
            self = .paused
        case .playing:
            self = .playing
        case .failed:
            self = .failed
        }
    }
}
