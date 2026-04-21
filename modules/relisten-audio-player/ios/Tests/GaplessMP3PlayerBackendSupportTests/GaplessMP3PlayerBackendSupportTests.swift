import XCTest
@testable import GaplessMP3PlayerBackendSupport

final class GaplessMP3PlayerBackendSupportTests: XCTestCase {
    func testPausedSeekUpdatesElapsedAndAppliesPausedStatusWithoutResumePath() async {
        let state = SeekCommandState(
            hasCurrentTrack: true,
            currentDuration: 120,
            requestedTime: 50,
            activeGeneration: 4,
            seekSequence: 1
        )
        var sideEffects: [String] = []

        let execution = state.begin { clampedTime in
            sideEffects.append("updateElapsed:\(clampedTime)")
        }

        XCTAssertEqual(execution?.clampedTime, 50)
        XCTAssertEqual(execution?.generation, 4)
        XCTAssertEqual(execution?.seekSequence, 1)

        await execution?.perform(
            seek: { sideEffects.append("seek:\($0)") },
            status: { "paused" },
            complete: { sideEffects.append("applyStatus:\($0)") },
            emitError: { error in
                XCTFail("unexpected seek error: \(error)")
            }
        )

        XCTAssertEqual(
            sideEffects,
            ["updateElapsed:50.0", "seek:50.0", "applyStatus:paused"]
        )
    }

    func testSeekClampsTimeBeforeSeekRoundTrip() async {
        let state = SeekCommandState(
            hasCurrentTrack: true,
            currentDuration: 30,
            requestedTime: 45,
            activeGeneration: 4,
            seekSequence: 1
        )
        var sideEffects: [String] = []

        let execution = state.begin { clampedTime in
            sideEffects.append("updateElapsed:\(clampedTime)")
        }

        XCTAssertEqual(execution?.clampedTime, 30)

        await execution?.perform(
            seek: { sideEffects.append("seek:\($0)") },
            status: { "paused" },
            complete: { sideEffects.append("applyStatus:\($0)") },
            emitError: { error in
                XCTFail("unexpected seek error: \(error)")
            }
        )

        XCTAssertEqual(
            sideEffects,
            ["updateElapsed:30.0", "seek:30.0", "applyStatus:paused"]
        )
    }

    func testSeekExecutionDropsStaleResultsAfterGenerationInvalidation() {
        let state = SeekCommandState(
            hasCurrentTrack: true,
            currentDuration: 120,
            requestedTime: 50,
            activeGeneration: 4,
            seekSequence: 1
        )

        let execution = state.begin { _ in }

        XCTAssertEqual(execution?.shouldApplyResult(activeGeneration: 4, currentSeekSequence: 1), true)
        XCTAssertEqual(execution?.shouldApplyResult(activeGeneration: 5, currentSeekSequence: 1), false)
    }

    func testSeekExecutionDropsStaleResultsAfterNewerSeekInSameGeneration() {
        let state = SeekCommandState(
            hasCurrentTrack: true,
            currentDuration: 120,
            requestedTime: 50,
            activeGeneration: 4,
            seekSequence: 1
        )

        let execution = state.begin { _ in }

        XCTAssertEqual(execution?.shouldApplyResult(activeGeneration: 4, currentSeekSequence: 2), false)
        XCTAssertEqual(execution?.shouldApplyResult(activeGeneration: 4, currentSeekSequence: 1), true)
    }

    func testSeekWithoutCurrentTrackIsNoOp() {
        let state = SeekCommandState(
            hasCurrentTrack: false,
            currentDuration: 30,
            requestedTime: 15,
            activeGeneration: 4,
            seekSequence: 1
        )

        XCTAssertNil(state.begin { _ in XCTFail("elapsed should not update without a current track") })
    }

    func testResumeAfterStopDoesNotTriggerAnyResumeSideEffects() {
        let state = ResumeCommandState(isStopped: true)
        var sideEffects: [String] = []

        state.perform(
            prepareAudioSession: { sideEffects.append("prepareAudioSession") },
            play: {
                sideEffects.append("play")
                return true
            },
            updateStateToPlaying: { sideEffects.append("updateStateToPlaying") }
        )

        XCTAssertEqual(sideEffects, [])
    }

    func testResumeWhenPlaybackIsNotStoppedRunsResumePathInOrder() {
        let state = ResumeCommandState(isStopped: false)
        var sideEffects: [String] = []

        state.perform(
            prepareAudioSession: { sideEffects.append("prepareAudioSession") },
            play: {
                sideEffects.append("play")
                return true
            },
            updateStateToPlaying: { sideEffects.append("updateStateToPlaying") }
        )

        XCTAssertEqual(
            sideEffects,
            ["prepareAudioSession", "play", "updateStateToPlaying"]
        )
    }

    func testResumeDoesNotFlipStateWhenPlayFails() {
        let state = ResumeCommandState(isStopped: false)
        var sideEffects: [String] = []

        state.perform(
            prepareAudioSession: { sideEffects.append("prepareAudioSession") },
            play: {
                sideEffects.append("play")
                return false
            },
            updateStateToPlaying: { sideEffects.append("updateStateToPlaying") }
        )

        XCTAssertEqual(sideEffects, ["prepareAudioSession", "play"])
    }

    func testPresentationRevisionRejectsOlderWritesAfterNewerUpdate() {
        var gate = PlaybackPresentationRevisionGate()

        let staleRevision = gate.advance()
        let currentRevision = gate.advance()

        XCTAssertFalse(gate.shouldApply(staleRevision))
        XCTAssertTrue(gate.shouldApply(currentRevision))
    }

    func testNativeHandledPlayPauseRemoteCommandsAreNotForwardedToJavaScript() {
        XCTAssertFalse(NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript("pause"))
        XCTAssertFalse(NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript("resume"))
        XCTAssertFalse(NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript("play"))
        XCTAssertTrue(NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript("nextTrack"))
        XCTAssertTrue(NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript("prevTrack"))
    }

    func testRemoteSeekRequiresCurrentTrackAndDuration() {
        XCTAssertNil(RemoteCommandSeekPolicy(
            hasCurrentTrack: false,
            currentDuration: 120,
            requestedTime: 10
        ).acceptedTime)
        XCTAssertNil(RemoteCommandSeekPolicy(
            hasCurrentTrack: true,
            currentDuration: nil,
            requestedTime: 10
        ).acceptedTime)
        XCTAssertEqual(RemoteCommandSeekPolicy(
            hasCurrentTrack: true,
            currentDuration: 120,
            requestedTime: 130
        ).acceptedTime, 120)
    }

    func testPresentationDecisionClearsMissingMetadata() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: false,
            desiredTransport: .playing,
            systemSuspension: .none,
            writeMode: .active,
            renderStatus: .playing,
            renderIsPlaying: true,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .clear(reason: .missingMetadata))
    }

    func testPresentationDecisionKeepsBufferingAsMediaCenterPlaying() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .none,
            writeMode: .active,
            renderStatus: .preparing,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .update(MediaCenterPresentationUpdate(
            reason: .buffering,
            appState: .stalled,
            mediaCenterPlaybackState: .playing,
            playbackRate: 1.0
        )))
    }

    func testPresentationDecisionTreatsUnconfirmedPlayingPhaseAsBuffering() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .none,
            writeMode: .active,
            renderStatus: .playing,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .update(MediaCenterPresentationUpdate(
            reason: .buffering,
            appState: .stalled,
            mediaCenterPlaybackState: .playing,
            playbackRate: 1.0
        )))
    }

    func testPresentationDecisionUsesGraceWindowAsPlaying() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .none,
            writeMode: .active,
            renderStatus: .preparing,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: true
        ).resolve()

        XCTAssertEqual(decision, .update(MediaCenterPresentationUpdate(
            reason: .awaitingRender,
            appState: .playing,
            mediaCenterPlaybackState: .playing,
            playbackRate: 1.0
        )))
    }

    func testPresentationDecisionFreezesFrozenWriteMode() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .temporaryInterruption,
            writeMode: .frozen,
            renderStatus: .paused,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .freeze(reason: .temporaryInterruption))
    }

    func testPresentationDecisionInterruptsTemporarySuspension() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .temporaryInterruption,
            writeMode: .active,
            renderStatus: .paused,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .update(MediaCenterPresentationUpdate(
            reason: .temporaryInterruption,
            appState: .stalled,
            mediaCenterPlaybackState: .interrupted,
            playbackRate: 0.0
        )))
    }

    func testPresentationDecisionSuppressesExternalMedia() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .externalMedia,
            writeMode: .suppressed,
            renderStatus: .paused,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .clear(reason: .externalMedia))
    }

    func testPresentationDecisionDoesNotPretendStoppedRenderIsPlaying() {
        let decision = MediaCenterPresentationInput(
            hasCurrentMetadata: true,
            desiredTransport: .playing,
            systemSuspension: .none,
            writeMode: .active,
            renderStatus: .stopped,
            renderIsPlaying: false,
            isWithinResumeGraceWindow: false
        ).resolve()

        XCTAssertEqual(decision, .update(MediaCenterPresentationUpdate(
            reason: .renderStoppedUnexpectedly,
            appState: .stalled,
            mediaCenterPlaybackState: .interrupted,
            playbackRate: 0.0
        )))
    }

    func testNextWithoutCurrentTrackIsNoOp() {
        var state = NextCommandState(
            hasCurrentTrack: false,
            preparedNextIdentifier: nil,
            desiredNextIdentifier: nil,
            activeGeneration: 4
        )

        XCTAssertEqual(state.resolve(), .noOp)
    }

    func testNextWithoutQueuedTrackStopsCurrentTrackAndInvalidatesInFlightWork() {
        var state = NextCommandState(
            hasCurrentTrack: true,
            preparedNextIdentifier: nil,
            desiredNextIdentifier: nil,
            activeGeneration: 4
        )

        XCTAssertEqual(state.resolve(), .stopCurrentTrack(invalidatedGeneration: 5))
    }

    func testNextUsesQueuedTrackWhenOneExists() {
        var state = NextCommandState(
            hasCurrentTrack: true,
            preparedNextIdentifier: nil,
            desiredNextIdentifier: "sunset-in-july",
            activeGeneration: 4
        )

        XCTAssertEqual(state.resolve(), .playQueuedNext)
    }

    func testLatestPlayRequestInvalidatesEarlierPrepareCompletion() {
        var state = PlaySupersessionState(activeGeneration: 0)

        let generationA = state.beginPlayRequest()
        let generationB = state.beginPlayRequest()

        XCTAssertEqual(generationA, 1)
        XCTAssertEqual(generationB, 2)
        XCTAssertEqual(
            state.prepareCompletionAction(for: generationA),
            .discardStalePrepareCompletion
        )
        XCTAssertEqual(
            state.prepareCompletionAction(for: generationB),
            .applyPreparedTrack
        )
    }

    func testLatestQueuedNextWinsWhilePrepareIsInFlight() {
        var state = NextStreamSupersessionState(
            hasCurrentTrack: true,
            appliedNextIdentifier: nil,
            desiredNextIdentifier: nil,
            isPreparingCurrentTrack: true
        )

        XCTAssertEqual(state.request("omaha-stylee"), .updateLocalStateOnly)
        XCTAssertNil(state.appliedNextIdentifier)
        XCTAssertEqual(state.desiredNextIdentifier, "omaha-stylee")

        XCTAssertEqual(state.request("sunset-in-july"), .updateLocalStateOnly)
        XCTAssertNil(state.appliedNextIdentifier)
        XCTAssertEqual(state.desiredNextIdentifier, "sunset-in-july")

        let reconciled = NextStreamSupersessionState(
            hasCurrentTrack: state.hasCurrentTrack,
            appliedNextIdentifier: state.appliedNextIdentifier,
            desiredNextIdentifier: state.desiredNextIdentifier,
            isPreparingCurrentTrack: false
        )

        XCTAssertEqual(reconciled.reconcileAfterPrepare(), .applyDesiredNext)
        XCTAssertEqual(reconciled.desiredNextIdentifier, "sunset-in-july")
    }

    func testNoCurrentTrackCommitsRequestedNextLocallyWithoutAsyncApply() {
        var state = NextStreamSupersessionState(
            hasCurrentTrack: false,
            appliedNextIdentifier: nil,
            desiredNextIdentifier: nil,
            isPreparingCurrentTrack: false
        )

        XCTAssertEqual(state.request("intro"), .updateLocalStateOnly)
        XCTAssertEqual(state.appliedNextIdentifier, "intro")
        XCTAssertEqual(state.desiredNextIdentifier, "intro")
        XCTAssertEqual(state.reconcileAfterPrepare(), .none)
    }
}
