import Foundation
import XCTest
@testable import GaplessMP3PlayerBackendSupport

final class PlaybackCheckpointTests: XCTestCase {
    func record(_ sequence: UInt64, identifier: String = "entry-A", elapsed: Double = 120,
                checkpoint: Bool = false, trackChanged: Bool = false) -> PlaybackCheckpoint {
        PlaybackCheckpoint(sessionId: "session", sequence: sequence, identifier: identifier,
                           sourceTrackUuid: "track", elapsed: elapsed, duration: 381,
                           capturedAt: -999, playbackState: checkpoint ? "Paused" : "Playing",
                           trackChanged: trackChanged, checkpoint: checkpoint)
    }

    func testFinalCheckpointBypassesThrottleAndRejectsDelayedOlderWrites() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("checkpoint.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = PlaybackCheckpointStore(url: url)
        XCTAssertTrue(try store.write(record(1), uptime: 0))
        XCTAssertFalse(try store.write(record(2, elapsed: 121), uptime: 1))
        XCTAssertTrue(try store.write(record(3, elapsed: 122, checkpoint: true), uptime: 2))
        XCTAssertFalse(try store.write(record(2, elapsed: 121, checkpoint: true), uptime: 3))
        XCTAssertEqual(store.read()?.elapsed, 122)
        XCTAssertEqual(PlaybackCheckpointStore(url: url).nextSequence(), 4)
    }

    func testContinuousSamplesCannotPostponeTheFiveSecondWrite() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("checkpoint.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = PlaybackCheckpointStore(url: url)
        for index in 0...10 {
            let written = try store.write(record(UInt64(index + 1), elapsed: Double(index)), uptime: Double(index))
            XCTAssertEqual(written, index % 5 == 0)
        }
        XCTAssertEqual(store.read()?.elapsed, 10)
    }

    func testTransitionsBypassThrottleAndRepeatedFinalSnapshotsDoNotRewrite() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("checkpoint.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = PlaybackCheckpointStore(url: url)
        XCTAssertTrue(try store.write(record(1), uptime: 0))
        XCTAssertTrue(try store.write(record(2, identifier: "entry-B", elapsed: 0, trackChanged: true), uptime: 0.1))
        XCTAssertTrue(try store.write(record(3, identifier: "entry-B", elapsed: 0, checkpoint: true), uptime: 0.2))
        XCTAssertFalse(try store.write(record(4, identifier: "entry-B", elapsed: 0, checkpoint: true), uptime: 0.3))
        XCTAssertEqual(store.read()?.identifier, "entry-B")
    }

    func testInvalidJournalAndWriteFailuresAreObservable() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        try Data("invalid".utf8).write(to: url)
        XCTAssertNil(PlaybackCheckpointStore(url: url).read())
        let store = PlaybackCheckpointStore(url: url.appendingPathComponent("not-a-directory"))
        XCTAssertThrowsError(try store.write(record(1, checkpoint: true)))
    }
    func testRetiredNativeSessionCannotOverwriteTheActiveSessionJournal() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("checkpoint.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = PlaybackCheckpointStore(url: url)
        store.activate(sessionId: "session")
        XCTAssertTrue(try store.write(record(1), uptime: 0))
        store.activate(sessionId: "new-session")
        XCTAssertFalse(try store.write(record(100, elapsed: 300, checkpoint: true), uptime: 10))
        XCTAssertEqual(store.read()?.sequence, 1)
    }

}
