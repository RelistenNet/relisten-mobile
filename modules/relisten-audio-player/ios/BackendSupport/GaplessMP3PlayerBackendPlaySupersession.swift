import Foundation

enum PlaySupersessionCompletionAction: Equatable {
    case discardStalePrepareCompletion
    case applyPreparedTrack
}

struct PlaySupersessionState {
    private(set) var activeGeneration: UInt64

    mutating func beginPlayRequest() -> UInt64 {
        activeGeneration += 1
        return activeGeneration
    }

    func prepareCompletionAction(for generation: UInt64) -> PlaySupersessionCompletionAction {
        generation == activeGeneration ? .applyPreparedTrack : .discardStalePrepareCompletion
    }
}
