import Foundation
import XCTest
@testable import GaplessMP3PlayerBackendSupport

final class PlaybackInterruptionRecoveryTests: XCTestCase {
    func testPreparingReplacementCannotReclaimOwnershipBeforeActivationSucceeds() {
        var state = playing()
        state.suppressForExternalMedia()
        state.beginPreparation()
        XCTAssertTrue(state.isSuppressed)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))

        state.resumeFailed()
        XCTAssertTrue(state.isSuppressed)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))

        state.beginResume()
        XCTAssertFalse(state.isSuppressed)
        guard case .update(let accepted) = decision(state) else { return XCTFail("Expected accepted resume") }
        XCTAssertEqual(accepted.appState, .stalled)
        XCTAssertEqual(accepted.playbackRate, 0)
    }

    func testPreparingSourceDoesNotAdvertisePlaybackAndNewTransportEventsCancelItsPermission() {
        var state = MediaCenterPresentationState()
        state.beginPreparation()
        let preparationRevision = state.transportRevision
        guard case .update(let preparing) = decision(state) else { return XCTFail("Expected preparation") }
        XCTAssertEqual(preparing.appState, .stalled)
        XCTAssertEqual(preparing.playbackRate, 0)

        for event in ["pause", "takeover", "interruption"] {
            var cancelled = state
            switch event {
            case "pause": cancelled.pause()
            case "takeover": cancelled.suppressForExternalMedia()
            default: _ = cancelled.interruptionBegan()
            }
            XCTAssertFalse(cancelled.acceptsStatus(revision: preparationRevision), event)
            XCTAssertFalse(cancelled.canStartPlayback, event)
        }
    }

    private func playing() -> MediaCenterPresentationState {
        var state = MediaCenterPresentationState()
        state.beginResume()
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        return state
    }

    private func decision(_ state: MediaCenterPresentationState) -> MediaCenterPresentationDecision {
        MediaCenterPresentationInput(hasCurrentMetadata: true, presentation: state,
                                     isWithinPresentationGraceWindow: state.grace.isActive).resolve()
    }

    func testInterruptionEndImmediatelyAuthorizesOneResumeWithoutAnotherEvent() {
        var state = playing()
        XCTAssertEqual(state.interruptionBegan(), .pause)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
    }

    func testMediaServicesResetCannotResumeUntilActiveInterruptionEnds() {
        var state = playing()
        XCTAssertTrue(state.canStartPlayback)
        _ = state.interruptionBegan()
        state.beginTemporaryInterruption(renderStatus: .preparing)
        XCTAssertFalse(state.canStartPlayback)
        XCTAssertFalse(state.completeMediaServicesReset())
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
        XCTAssertTrue(state.completeMediaServicesReset())
    }

    func testPreparedTrackWaitsForInterruptionPermissionBeforeStarting() {
        var state = MediaCenterPresentationState()
        state.beginPreparation()
        _ = state.interruptionBegan()
        // Preparation can finish before the interruption ends. Neither a
        // prepared renderer nor preserved intent grants playback permission.
        state.applyRenderStatus(renderStatus: .paused, renderIsPlaying: false, hasCurrentSource: true)
        XCTAssertFalse(state.canStartPlayback)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
        XCTAssertTrue(state.canStartPlayback)
    }

    func testMediaServicesResetCannotRestorePausedOrYieldedIntent() {
        var state = playing()
        state.pause()
        XCTAssertFalse(state.canStartPlayback)
        state.suppressForExternalMedia()
        XCTAssertFalse(state.canStartPlayback)
    }

    func testResetCompletionCannotClearTakeoverThatArrivedDuringPreparation() {
        var state = playing()
        state.beginTemporaryInterruption(renderStatus: .preparing)
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: false), .yield)
        XCTAssertFalse(state.completeMediaServicesReset())
        XCTAssertTrue(state.isSuppressed)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))
    }

    func testDelayedPreInterruptionPlayingStatusCannotConfirmANewResume() {
        var state = playing()
        let oldRevision = state.transportRevision
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true)
        state.beginResume()
        XCTAssertFalse(state.acceptsStatus(revision: oldRevision))
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true,
                                hasCurrentSource: true, revision: oldRevision)
        XCTAssertTrue(state.awaitingResumeRender)
        XCTAssertFalse(state.renderIsPlaying)
        guard case .update(let pending) = decision(state) else { return XCTFail("Expected pending state") }
        XCTAssertEqual(pending.playbackRate, 0)
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true,
                                hasCurrentSource: true, revision: state.transportRevision)
        XCTAssertFalse(state.awaitingResumeRender)
        XCTAssertTrue(state.renderIsPlaying)
    }

    func testNoResumePermissionYieldsAndDuplicateEndCannotTakeOwnershipBack() {
        var state = playing()
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: false), .yield)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(state.writeMode, .suppressed)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))
    }

    func testUserPauseOrDeviceLossDuringInterruptionCancelsAutoResume() {
        var state = playing()
        _ = state.interruptionBegan()
        // User pause and oldDeviceUnavailable share this cancellation transition.
        state.pause()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(state.systemSuspension, .none)
    }

    func testExternalTakeoverDuringInterruptionCancelsRecovery() {
        var state = playing()
        _ = state.interruptionBegan()
        state.suppressForExternalMedia()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
        XCTAssertTrue(state.isSuppressed)
    }

    func testDuplicateBeganAndEndedNotificationsDoNotCreateResumeRequests() {
        var state = playing()
        XCTAssertEqual(state.interruptionBegan(), .pause)
        state.freezeWritesForInterruption()
        XCTAssertEqual(state.interruptionBegan(), .none)
        XCTAssertEqual(state.writeMode, .frozen)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
        state.beginResume()
        XCTAssertEqual(state.interruptionEnded(shouldResume: false), .none)
        XCTAssertEqual(state.desiredTransport, .playing)
    }

    func testRepeatedSeparateInterruptionsCanEachResume() {
        var state = playing()
        for _ in 0..<3 {
            XCTAssertEqual(state.interruptionBegan(), .pause)
            XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
            state.beginResume()
            state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        }
    }

    func testExplicitPlayCanReclaimAnOngoingExternalInterruptionIfActivationSucceeds() {
        var state = playing()
        _ = state.interruptionBegan()
        var playCalls = 0
        ResumeCommandState(isStopped: false).perform(
            prepareAudioSession: {},
            play: { playCalls += 1; return true },
            onPlayAccepted: { state.beginResume() }
        )
        XCTAssertEqual(playCalls, 1)
        XCTAssertFalse(state.recovery.interruptionActive)
        XCTAssertTrue(state.awaitingResumeRender)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
    }

    func testRejectedExplicitPlayDuringCallPreservesPreCallIntentUntilPermissionArrives() {
        var state = playing()
        _ = state.interruptionBegan()
        state.resumeFailed()
        XCTAssertTrue(state.recovery.interruptionActive)
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertEqual(state.systemSuspension, .temporaryInterruption)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
    }

    func testInterruptionOfPausedOrStoppedPlaybackNeverAutoResumes() {
        for stopped in [false, true] {
            var state = playing()
            if stopped { state.stop() } else { state.pause() }
            _ = state.interruptionBegan()
            XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
            XCTAssertNotEqual(state.desiredTransport, .playing)
        }
    }

    func testRejectedAutomaticActivationNeverPlaysOrRetriesWithoutExplicitCommand() throws {
        enum ActivationFailure: Error { case rejected }
        var state = playing()
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .resume)
        var playCalls = 0
        var activationRejected = true
        let resume = ResumeCommandState(isStopped: false)
        func attempt() throws -> Bool {
            try resume.perform(prepareAudioSession: {
                if activationRejected { throw ActivationFailure.rejected }
            }, play: { playCalls += 1; return true }, onPlayAccepted: { state.beginResume() })
        }
        XCTAssertThrowsError(try attempt())
        state.resumeFailed()
        XCTAssertEqual(playCalls, 0)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true), .none)
        guard case .update(let failed) = decision(state) else { return XCTFail("Expected paused presentation") }
        XCTAssertEqual(failed.appState, .paused)
        XCTAssertEqual(failed.playbackRate, 0)

        activationRejected = false
        XCTAssertTrue(try attempt())
        XCTAssertEqual(playCalls, 1)
        guard case .update(let pending) = decision(state) else { return XCTFail("Expected pending presentation") }
        XCTAssertEqual(pending.appState, .stalled)
        XCTAssertEqual(pending.mediaCenterPlaybackState, .paused)
        XCTAssertEqual(pending.playbackRate, 0)
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        guard case .update(let rendered) = decision(state) else { return XCTFail("Expected playing presentation") }
        XCTAssertEqual(rendered.appState, .playing)
        XCTAssertEqual(rendered.playbackRate, 1)
    }

    func testFailedExplicitResumeDoesNotReclaimExternalMediaPresentation() {
        var state = playing()
        state.suppressForExternalMedia()
        state.resumeFailed()
        XCTAssertTrue(state.isSuppressed)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))
        state.beginResume()
        XCTAssertFalse(state.isSuppressed)
    }

    func testQueuedResumeWithNoRenderedAudioStaysAtRateZeroAcrossStatusPolling() {
        var state = playing()
        state.pause()
        state.beginResume()
        for renderStatus in [MediaCenterRenderStatus.paused, .preparing, .playing] {
            state.applyRenderStatus(renderStatus: renderStatus, renderIsPlaying: false, hasCurrentSource: true)
            guard case .update(let update) = decision(state) else { return XCTFail("Expected update") }
            XCTAssertEqual(update.appState, .stalled)
            XCTAssertEqual(update.playbackRate, 0)
        }
    }

    func testRemoteToggleUsesTheDisplayedResumeOutcomeRatherThanQueuedIntent() {
        var state = playing()
        func togglePauses() -> Bool {
            MediaCenterPresentationInput(hasCurrentMetadata: true, presentation: state,
                                         isWithinPresentationGraceWindow: false).shouldTogglePause
        }
        XCTAssertTrue(togglePauses())
        _ = state.interruptionBegan()
        XCTAssertFalse(togglePauses())
        _ = state.interruptionEnded(shouldResume: true)
        state.beginResume()
        XCTAssertFalse(togglePauses())
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        XCTAssertTrue(togglePauses())
        state.resumeFailed()
        XCTAssertFalse(togglePauses())
    }
}
