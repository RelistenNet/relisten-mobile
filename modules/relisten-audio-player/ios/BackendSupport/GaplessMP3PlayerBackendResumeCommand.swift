import Foundation

struct ResumeCommandState {
    let isStopped: Bool

    @discardableResult
    func perform(
        prepareAudioSession: () throws -> Void,
        play: () -> Bool,
        onPlayAccepted: () -> Void
    ) rethrows -> Bool {
        guard !isStopped else { return false }
        try prepareAudioSession()
        guard play() else { return false }
        onPlayAccepted()
        return true
    }
}
