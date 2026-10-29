import Foundation

enum PlaybackInterruptionAction: Equatable {
    case none
    case pause
    case resume
    case yield
}

struct PlaybackInterruptionRecovery: Equatable {
    private(set) var interruptionActive = false
    private var eligibleToResume = false

    mutating func cancelResume() {
        eligibleToResume = false
    }

    mutating func began(wantsPlayback: Bool) -> PlaybackInterruptionAction {
        // AVAudioSession notifications have no nesting identifier. Repeated
        // began notifications describe the same active interruption.
        guard !interruptionActive else { return .none }
        interruptionActive = true
        eligibleToResume = wantsPlayback
        return .pause
    }

    mutating func ended(shouldResume: Bool, wantsPlayback: Bool) -> PlaybackInterruptionAction {
        guard interruptionActive else { return .none }
        interruptionActive = false
        defer { cancelResume() }
        guard eligibleToResume, wantsPlayback else {
            return .none
        }
        // Relisten's music is primary audio, so secondary-audio hints do not
        // defer recovery. Activation still decides whether playback can start.
        return shouldResume ? .resume : .yield
    }
}

extension MediaCenterPresentationState {
    var canStartPlayback: Bool {
        desiredTransport == .playing && !isSuppressed &&
            !recovery.interruptionActive
    }

    mutating func completeMediaServicesReset() -> Bool {
        if canStartPlayback { return true }
        if systemSuspension == .temporaryInterruption,
           !recovery.interruptionActive {
            clearSuspension()
        }
        return false
    }

    mutating func interruptionBegan() -> PlaybackInterruptionAction {
        let action = recovery.began(wantsPlayback: desiredTransport == .playing && !isSuppressed)
        if action == .pause {
            if isSuppressed {
                // Invalidate earlier preparation without claiming presentation.
                transportRevision &+= 1
            } else {
                beginTemporaryInterruption()
            }
        }
        return action
    }

    mutating func interruptionEnded(shouldResume: Bool) -> PlaybackInterruptionAction {
        let action = recovery.ended(
            shouldResume: shouldResume,
            wantsPlayback: desiredTransport == .playing && !isSuppressed
        )
        if action == .yield {
            suppressForExternalMedia()
        } else if !recovery.interruptionActive, desiredTransport != .playing, !isSuppressed {
            clearSuspension()
        }
        return action
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
