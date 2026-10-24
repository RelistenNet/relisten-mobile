import Foundation

enum PlaybackInterruptionAction: Equatable {
    case none
    case pause
    case resume
    case yield
}

struct PlaybackInterruptionRecovery: Equatable {
    private(set) var interruptionActive = false
    private(set) var silenceHintActive = false
    private var eligibleToResume = false
    private var pendingResume = false

    var needsHintReconciliation: Bool {
        pendingResume && !interruptionActive && silenceHintActive
    }

    mutating func cancelResume() {
        eligibleToResume = false
        pendingResume = false
    }

    mutating func began(wantsPlayback: Bool) -> PlaybackInterruptionAction {
        // AVAudioSession notifications have no nesting identifier. Repeated
        // began notifications describe the same active interruption.
        guard !interruptionActive else { return .none }
        interruptionActive = true
        eligibleToResume = wantsPlayback
        pendingResume = false
        return .pause
    }

    mutating func ended(shouldResume: Bool, silenced: Bool, wantsPlayback: Bool) -> PlaybackInterruptionAction {
        guard interruptionActive else { return .none }
        interruptionActive = false
        // Hint-end delivery is limited to foreground, active audio sessions.
        // Reconcile the current property as well as the hint notifications.
        silenceHintActive = silenced
        guard eligibleToResume, wantsPlayback else {
            cancelResume()
            return .none
        }
        guard shouldResume else {
            cancelResume()
            return .yield
        }
        pendingResume = true
        return takeResumeIfReady()
    }

    mutating func silenceHint(began: Bool) -> PlaybackInterruptionAction {
        silenceHintActive = began
        // A hint alone concerns secondary audio, not ownership of this music
        // player's session. It only defers an already-permitted recovery.
        return takeResumeIfReady()
    }

    private mutating func takeResumeIfReady() -> PlaybackInterruptionAction {
        guard pendingResume, !interruptionActive, !silenceHintActive else { return .none }
        cancelResume()
        return .resume
    }
}

extension MediaCenterPresentationState {
    var canStartPlayback: Bool {
        desiredTransport == .playing && !isSuppressed &&
            !recovery.interruptionActive && !recovery.needsHintReconciliation
    }

    mutating func completeMediaServicesReset() -> Bool {
        if canStartPlayback { return true }
        if systemSuspension == .temporaryInterruption,
           !recovery.interruptionActive, !recovery.needsHintReconciliation {
            clearSuspension()
        }
        return false
    }

    mutating func interruptionBegan() -> PlaybackInterruptionAction {
        let action = recovery.began(wantsPlayback: desiredTransport == .playing && !isSuppressed)
        if action == .pause, !isSuppressed {
            beginTemporaryInterruption()
        }
        return action
    }

    mutating func interruptionEnded(shouldResume: Bool, silenced: Bool) -> PlaybackInterruptionAction {
        let action = recovery.ended(shouldResume: shouldResume, silenced: silenced,
                                    wantsPlayback: desiredTransport == .playing && !isSuppressed)
        if action == .yield {
            suppressForExternalMedia()
        } else if !recovery.interruptionActive, desiredTransport != .playing, !isSuppressed {
            clearSuspension()
        }
        return action
    }

    mutating func silenceHint(began: Bool) -> PlaybackInterruptionAction {
        recovery.silenceHint(began: began)
    }

    mutating func beginResume() {
        // Revision changes without changing the track/generation identity.
        transportRevision &+= 1
        recovery = PlaybackInterruptionRecovery()
        desiredTransport = .playing
        systemSuspension = .none
        writeMode = .active
        renderStatus = .paused
        renderIsPlaying = false
        awaitingResumeRender = true
        grace = .none
    }

    mutating func resumeFailed() {
        // Keep the prepared source and explicit retry available. A failed
        // activation must never become an implicit future resume request.
        if recovery.interruptionActive {
            // A failed explicit attempt cannot erase the pre-call intent. A
            // later shouldResume still authorizes recovery; no audio starts now.
            transportRevision &+= 1
            awaitingResumeRender = false
            renderStatus = .paused
            renderIsPlaying = false
            grace = .none
        } else if isSuppressed {
            suppressForExternalMedia()
        } else {
            pause()
        }
    }
}
