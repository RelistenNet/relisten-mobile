import Foundation

struct RemoteCommandSeekPolicy {
    let hasCurrentTrack: Bool
    let currentDuration: TimeInterval?
    let requestedTime: TimeInterval

    var acceptedTime: TimeInterval? {
        guard hasCurrentTrack, let currentDuration, currentDuration > 0 else {
            return nil
        }

        guard requestedTime.isFinite, requestedTime >= 0 else {
            return nil
        }

        return min(requestedTime, currentDuration)
    }
}
