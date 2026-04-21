import Foundation
import XCTest
@testable import GaplessMP3Player

final class PCMOutputGraphTests: XCTestCase {
    func testPauseStopsEngineAndRequestPlayRestartsIt() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.output")

        try queue.sync {
            let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)
            let chunk = PCMChunk.silence(sampleRate: 44_100, channelCount: 2, frameCount: 44_100)

            XCTAssertTrue(graph.isEngineRunning)

            try graph.schedule(chunk, playedBack: nil)
            try graph.requestPlay()
            XCTAssertTrue(graph.isPlaying)
            XCTAssertTrue(graph.isEngineRunning)

            graph.pause()
            XCTAssertFalse(graph.isPlaying)
            XCTAssertFalse(graph.isEngineRunning)

            try graph.requestPlay()
            XCTAssertTrue(graph.isPlaying)
            XCTAssertTrue(graph.isEngineRunning)
        }
    }

    func testResetAfterPauseKeepsEnginePausedUntilPlaybackRequested() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.paused-reset")

        try queue.sync {
            let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)
            let chunk = PCMChunk.silence(sampleRate: 44_100, channelCount: 2, frameCount: 44_100)

            try graph.schedule(chunk, playedBack: nil)
            try graph.requestPlay()
            XCTAssertTrue(graph.isEngineRunning)

            graph.pause()
            XCTAssertFalse(graph.isEngineRunning)

            try graph.reset(timelineOffset: 10, startEngine: false)
            XCTAssertFalse(graph.isPlaying)
            XCTAssertFalse(graph.isEngineRunning)

            try graph.schedule(chunk, playedBack: nil)
            try graph.requestPlay()
            XCTAssertTrue(graph.isPlaying)
            XCTAssertTrue(graph.isEngineRunning)
        }
    }

    func testResetCanWarmEngineForPlaybackRestart() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.warm-reset")

        try queue.sync {
            let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)

            graph.pause()
            XCTAssertFalse(graph.isEngineRunning)

            try graph.reset(timelineOffset: 10, startEngine: true)
            XCTAssertFalse(graph.isPlaying)
            XCTAssertTrue(graph.isEngineRunning)
        }
    }
}
