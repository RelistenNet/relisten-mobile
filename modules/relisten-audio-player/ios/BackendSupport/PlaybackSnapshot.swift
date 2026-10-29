import Foundation

/// Live backend observation. Timing is in seconds; nil identity means no active native track.
/// Sequence orders observations within one backend instance, before asynchronous bridge delivery.
struct PlaybackSnapshot: Sendable {
    let sessionId: String
    let sequence: UInt64
    let identifier: String?
    let sourceTrackUuid: String?
    let elapsed: Double?
    let duration: Double?
    let playbackState: String
    let checkpoint: Bool

    var payload: [String: Any] {
        var result: [String: Any] = [
            "sessionId": sessionId,
            "sequence": sequence,
            "playbackState": playbackState,
            "checkpoint": checkpoint
        ]
        if let identifier {
            result["identifier"] = identifier
        }
        if let sourceTrackUuid {
            result["sourceTrackUuid"] = sourceTrackUuid
        }
        if let elapsed, elapsed.isFinite {
            result["elapsed"] = elapsed
        }
        if let duration, duration.isFinite {
            result["duration"] = duration
        }
        return result
    }
}
