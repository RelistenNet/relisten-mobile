import AVFoundation
import Foundation
import XCTest
@testable import GaplessMP3Player

final class PCMOutputGraphTests: XCTestCase {
    func testUnavailableRenderTimeNeverReachesPlayerTimeConversion() {
        let invalidTime = AVAudioTime()
        XCTAssertFalse(invalidTime.isSampleTimeValid)
        XCTAssertFalse(invalidTime.isHostTimeValid)

        for renderTime in [nil, invalidTime] {
            let elapsed = PCMOutputGraph.elapsedTime(for: renderTime) { _ in
                XCTFail("Invalid node time must not reach AVAudioPlayerNode")
                return AVAudioTime(sampleTime: 44_100, atRate: 44_100)
            }
            XCTAssertNil(elapsed)
        }
    }

    func testEitherValidRenderClockCanBeConvertedToElapsedSampleTime() {
        for renderTime in [AVAudioTime(sampleTime: 0, atRate: 44_100), AVAudioTime(hostTime: 1)] {
            let elapsed = PCMOutputGraph.elapsedTime(for: renderTime) { _ in
                return AVAudioTime(sampleTime: 88_200, atRate: 44_100)
            }
            XCTAssertEqual(elapsed, 2)
        }
    }

    func testUnavailablePlayerSampleTimeDoesNotProduceElapsedTime() {
        let renderTime = AVAudioTime(hostTime: 1)
        for playerTime in [nil, AVAudioTime(), AVAudioTime(hostTime: 1),
                           AVAudioTime(sampleTime: 1, atRate: 0),
                           AVAudioTime(sampleTime: 1, atRate: .infinity),
                           AVAudioTime(sampleTime: 1, atRate: .nan)] {
            XCTAssertNil(PCMOutputGraph.elapsedTime(for: renderTime) { _ in playerTime })
        }
    }

    func testRepeatedResetUsesExplicitOffsetBeforePlaybackAndAfterPause() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.clock-reset")
        try queue.sync {
            let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)
            for offset in [30.0, 5, 0] {
                try graph.reset(timelineOffset: offset, startEngine: true)
                XCTAssertEqual(graph.currentTime(), offset)
                graph.pause()
                try graph.reset(timelineOffset: offset, startEngine: false)
                XCTAssertEqual(graph.currentTime(), offset)
                XCTAssertFalse(graph.isEngineRunning)
            }
        }
    }

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
