import Foundation

enum NextCommandAction: Equatable {
    case noOp
    case stopCurrentTrack(invalidatedGeneration: UInt64)
    case playQueuedNext
}

struct NextCommandState {
    let hasCurrentTrack: Bool
    let preparedNextIdentifier: String?
    let desiredNextIdentifier: String?
    private(set) var activeGeneration: UInt64

    mutating func resolve() -> NextCommandAction {
        guard hasCurrentTrack else { return .noOp }
        guard preparedNextIdentifier != nil || desiredNextIdentifier != nil else {
            activeGeneration += 1
            return .stopCurrentTrack(invalidatedGeneration: activeGeneration)
        }
        return .playQueuedNext
    }
}
