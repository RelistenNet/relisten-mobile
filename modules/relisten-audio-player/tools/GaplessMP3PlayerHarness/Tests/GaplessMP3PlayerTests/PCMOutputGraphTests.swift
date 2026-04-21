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
}
