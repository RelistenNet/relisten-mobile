import XCTest
@testable import GaplessMP3PlayerBackendSupport

final class GaplessMP3PlayerBackendSupportTests: XCTestCase {
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
