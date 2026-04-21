import Foundation

struct SeekCompletionStatusProjection {
    let desiredTransport: MediaCenterDesiredTransport
    let clampedSeekTime: TimeInterval
    let reportedElapsed: TimeInterval
    let reportedRenderStatus: MediaCenterRenderStatus
    let reportedRenderIsPlaying: Bool

    var elapsed: TimeInterval {
        desiredTransport == .paused ? clampedSeekTime : reportedElapsed
    }

    var renderStatus: MediaCenterRenderStatus {
        desiredTransport == .paused ? .paused : reportedRenderStatus
    }

    var renderIsPlaying: Bool {
        desiredTransport == .paused ? false : reportedRenderIsPlaying
    }
}
