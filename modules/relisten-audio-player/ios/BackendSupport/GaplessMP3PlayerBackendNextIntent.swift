import Foundation

enum NextStreamSupersessionRequestAction: Equatable {
    case updateLocalStateOnly
    case applyRequestedNextImmediately
}

enum NextStreamSupersessionReconcileAction: Equatable {
    case none
    case applyDesiredNext
}

struct NextStreamSupersessionState {
    let hasCurrentTrack: Bool
    private(set) var appliedNextIdentifier: String?
    private(set) var desiredNextIdentifier: String?
    let isPreparingCurrentTrack: Bool

    init(
        hasCurrentTrack: Bool,
        appliedNextIdentifier: String?,
        desiredNextIdentifier: String?,
        isPreparingCurrentTrack: Bool
    ) {
        self.hasCurrentTrack = hasCurrentTrack
        self.appliedNextIdentifier = appliedNextIdentifier
        self.desiredNextIdentifier = desiredNextIdentifier
        self.isPreparingCurrentTrack = isPreparingCurrentTrack
    }

    mutating func request(_ requestedIdentifier: String?) -> NextStreamSupersessionRequestAction {
        desiredNextIdentifier = requestedIdentifier

        guard hasCurrentTrack else {
            appliedNextIdentifier = requestedIdentifier
            return .updateLocalStateOnly
        }

        guard !isPreparingCurrentTrack else {
            return .updateLocalStateOnly
        }

        return .applyRequestedNextImmediately
    }

    func reconcileAfterPrepare() -> NextStreamSupersessionReconcileAction {
        guard hasCurrentTrack else { return .none }
        guard desiredNextIdentifier != appliedNextIdentifier else { return .none }
        return .applyDesiredNext
    }
}
