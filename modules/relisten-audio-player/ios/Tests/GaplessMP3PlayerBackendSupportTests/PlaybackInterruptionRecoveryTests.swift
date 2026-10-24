import Foundation
import XCTest
@testable import GaplessMP3PlayerBackendSupport

final class PlaybackInterruptionRecoveryTests: XCTestCase {
    private func playing() -> MediaCenterPresentationState {
        var state = MediaCenterPresentationState()
        state.beginPlayback(now: 0)
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        return state
    }

    private func decision(_ state: MediaCenterPresentationState) -> MediaCenterPresentationDecision {
        MediaCenterPresentationInput(hasCurrentMetadata: true, presentation: state,
                                     isWithinPresentationGraceWindow: state.grace.isActive).resolve()
    }

    func testHintClearsBeforeInterruptionEndsWithoutLosingIntent() {
        var state = playing()
        XCTAssertEqual(state.interruptionBegan(), .pause)
        XCTAssertEqual(state.silenceHint(began: true), .none)
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        XCTAssertEqual(state.desiredTransport, .playing)
    }

    func testHintClearsAfterInterruptionEndsAndResumesOnlyOnce() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.silenceHint(began: true)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: true), .none)
        XCTAssertEqual(state.systemSuspension, .temporaryInterruption)
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertEqual(state.silenceHint(began: false), .resume)
        XCTAssertEqual(state.silenceHint(began: false), .none)
    }

    func testHintBeginningBeforeInterruptionDoesNotPausePrimaryAudio() {
        var state = playing()
        XCTAssertEqual(state.silenceHint(began: true), .none)
        XCTAssertEqual(state.systemSuspension, .none)
        XCTAssertTrue(state.renderIsPlaying)
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: true), .none)
        XCTAssertEqual(state.silenceHint(began: false), .resume)
    }

    func testHintOnlyFlowsDoNotResumeOrSuppressPrimaryAudio() {
        for initiallyPlaying in [false, true] {
            var state = playing()
            if !initiallyPlaying { state.pause() }
            let original = state
            for began in [true, true, false, false] {
                XCTAssertEqual(state.silenceHint(began: began), .none)
                XCTAssertEqual(state.desiredTransport, original.desiredTransport)
                XCTAssertEqual(state.systemSuspension, original.systemSuspension)
                XCTAssertEqual(state.writeMode, original.writeMode)
                XCTAssertEqual(state.renderIsPlaying, original.renderIsPlaying)
            }
        }
    }

    func testHintStartsBeforeInterruptionAndEndsBeforeInterruptionEnd() {
        var state = playing()
        _ = state.silenceHint(began: true)
        _ = state.interruptionBegan()
        _ = state.silenceHint(began: false)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
    }

    func testLateHintAfterPermittedResumeDoesNotInterruptPrimaryAudio() {
        var state = playing()
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        state.beginResume()
        XCTAssertEqual(state.silenceHint(began: true), .none)
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertEqual(state.systemSuspension, .none)
    }

    func testCompletedHintBeforeInterruptionCannotChangeItsResumePermission() {
        var state = playing()
        _ = state.silenceHint(began: true)
        _ = state.silenceHint(began: false)
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
    }

    func testCurrentHintPropertyRecoversWhenHintEndNotificationWasNotDelivered() {
        var state = playing()
        _ = state.silenceHint(began: true)
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
    }

    func testLiveHintReconciliationRecoversWithoutHintEndNotification() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        XCTAssertTrue(state.recovery.needsHintReconciliation)
        XCTAssertEqual(state.silenceHint(began: true), .none)
        XCTAssertEqual(state.silenceHint(began: false), .resume)
        XCTAssertFalse(state.recovery.needsHintReconciliation)
        XCTAssertEqual(state.silenceHint(began: false), .none)
    }

    func testMediaServicesResetMayNotResumeAnActiveInterruptionOrPendingHint() {
        var state = playing()
        XCTAssertTrue(state.canStartPlayback)
        _ = state.interruptionBegan()
        state.beginTemporaryInterruption(renderStatus: .preparing)
        XCTAssertFalse(state.canStartPlayback)
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        XCTAssertFalse(state.canStartPlayback)
        XCTAssertEqual(state.silenceHint(began: false), .resume)
        XCTAssertTrue(state.canStartPlayback)
    }

    func testPreparedTrackWaitsForInterruptionPermissionBeforeStarting() {
        var state = MediaCenterPresentationState()
        state.beginPlayback(now: 0)
        _ = state.interruptionBegan()
        // Preparation can finish before the interruption ends. Neither a
        // prepared renderer nor preserved intent grants playback permission.
        state.applyRenderStatus(renderStatus: .paused, renderIsPlaying: false, hasCurrentSource: true)
        XCTAssertFalse(state.canStartPlayback)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        XCTAssertTrue(state.canStartPlayback)
    }

    func testPermittedResumeBeforePreparationFinishesStillRequiresActivationWhenReady() throws {
        var state = MediaCenterPresentationState()
        state.beginPlayback(now: 0)
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        state.beginResume()
        var effects: [String] = []
        XCTAssertTrue(state.canStartPlayback)
        ResumeCommandState(isStopped: false).perform(
            prepareAudioSession: { effects.append("activation") },
            play: { effects.append("play"); return true },
            onPlayAccepted: { state.beginResume() }
        )
        XCTAssertEqual(effects, ["activation", "play"])
        XCTAssertTrue(state.awaitingResumeRender)
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
        XCTAssertEqual(state.interruptionEnded(shouldResume: false, silenced: true), .yield)
        XCTAssertFalse(state.completeMediaServicesReset())
        XCTAssertTrue(state.isSuppressed)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))
        XCTAssertEqual(state.silenceHint(began: false), .none)
    }

    func testDelayedPreInterruptionPlayingStatusCannotConfirmANewResume() {
        var state = playing()
        let oldRevision = state.transportRevision
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: false)
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

    func testNoResumePermissionYieldsAndHintEndCannotTakeOwnershipBack() {
        var state = playing()
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: false, silenced: true), .yield)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(state.writeMode, .suppressed)
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .none)
        XCTAssertEqual(decision(state), .clear(reason: .externalMedia))
    }

    func testUserPauseDuringInterruptionCancelsAutoResume() {
        var state = playing()
        _ = state.interruptionBegan()
        state.pause()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .none)
        XCTAssertEqual(state.desiredTransport, .paused)
        XCTAssertEqual(state.systemSuspension, .none)
    }

    func testUserPauseWhileWaitingForHintEndCancelsAutoResume() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        state.pause()
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.desiredTransport, .paused)
    }

    func testRouteLossUsesPauseToCancelPendingRecovery() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        // The backend's oldDeviceUnavailable handler calls this same method.
        state.pause()
        XCTAssertEqual(state.silenceHint(began: false), .none)
    }

    func testExplicitExternalTakeoverCancelsPendingRecovery() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        state.suppressForExternalMedia()
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertTrue(state.isSuppressed)
    }

    func testDuplicateBeganAndEndedNotificationsDoNotCreateResumeRequests() {
        var state = playing()
        XCTAssertEqual(state.interruptionBegan(), .pause)
        state.freezeWritesForInterruption()
        XCTAssertEqual(state.interruptionBegan(), .none)
        XCTAssertEqual(state.writeMode, .frozen)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        state.beginResume()
        XCTAssertEqual(state.interruptionEnded(shouldResume: false, silenced: true), .none)
        XCTAssertEqual(state.desiredTransport, .playing)
    }

    func testASecondInterruptionWhileWaitingRequiresItsOwnResumePermission() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: true, silenced: true)
        XCTAssertEqual(state.interruptionBegan(), .pause)
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.interruptionEnded(shouldResume: false, silenced: false), .yield)
    }

    func testRepeatedSeparateInterruptionsCanEachResume() {
        var state = playing()
        for _ in 0..<3 {
            XCTAssertEqual(state.interruptionBegan(), .pause)
            XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
            state.beginResume()
            state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        }
    }

    func testExplicitPlayCanReclaimAnOngoingExternalInterruptionIfActivationSucceeds() {
        var state = playing()
        _ = state.interruptionBegan()
        var effects: [String] = []
        ResumeCommandState(isStopped: false).perform(
            prepareAudioSession: { effects.append("activation") },
            play: { effects.append("play"); return true },
            onPlayAccepted: { state.beginResume() }
        )
        XCTAssertEqual(effects, ["activation", "play"])
        XCTAssertFalse(state.recovery.interruptionActive)
        XCTAssertTrue(state.awaitingResumeRender)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .none)
    }

    func testRejectedExplicitPlayDuringCallPreservesPreCallIntentUntilPermissionArrives() {
        var state = playing()
        _ = state.interruptionBegan()
        state.resumeFailed()
        XCTAssertTrue(state.recovery.interruptionActive)
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertEqual(state.systemSuspension, .temporaryInterruption)
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
    }

    func testExplicitPlayAfterYieldCanRetryEvenWithAnAdvisoryHint() {
        var state = playing()
        _ = state.interruptionBegan()
        _ = state.interruptionEnded(shouldResume: false, silenced: true)
        state.beginResume()
        XCTAssertEqual(state.desiredTransport, .playing)
        XCTAssertFalse(state.isSuppressed)
    }

    func testInterruptionOfPausedOrStoppedPlaybackNeverAutoResumes() {
        for stopped in [false, true] {
            var state = playing()
            if stopped { state.stop() } else { state.pause() }
            _ = state.interruptionBegan()
            XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .none)
            XCTAssertNotEqual(state.desiredTransport, .playing)
        }
    }

    func testActivationRejectionNeverCallsPlayOrAdvertisesPlayingAndAllowsExplicitRetry() throws {
        enum ActivationFailure: Error { case rejected }
        var state = playing()
        state.pause()
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

    func testFailedAutomaticResumeCannotRetryFromDuplicateHintEnd() {
        var state = playing()
        _ = state.interruptionBegan()
        XCTAssertEqual(state.interruptionEnded(shouldResume: true, silenced: false), .resume)
        state.resumeFailed()
        XCTAssertEqual(state.silenceHint(began: false), .none)
        XCTAssertEqual(state.desiredTransport, .paused)
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
        _ = state.interruptionEnded(shouldResume: true, silenced: false)
        state.beginResume()
        XCTAssertFalse(togglePauses())
        state.applyRenderStatus(renderStatus: .playing, renderIsPlaying: true, hasCurrentSource: true)
        XCTAssertTrue(togglePauses())
        state.resumeFailed()
        XCTAssertFalse(togglePauses())
    }
}
