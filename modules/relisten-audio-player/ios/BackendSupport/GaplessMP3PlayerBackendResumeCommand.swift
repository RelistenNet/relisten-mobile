import Foundation

struct ResumeCommandState {
    let isStopped: Bool

    func perform(
        prepareAudioSession: () -> Void,
        play: () -> Bool,
        updateStateToPlaying: () -> Void
    ) {
        guard !isStopped else { return }
        prepareAudioSession()
        guard play() else { return }
        updateStateToPlaying()
    }
}
