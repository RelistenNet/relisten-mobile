import Foundation
import XCTest
@testable import GaplessMP3Player

final class PCMOutputGraphTests: XCTestCase {
    func testAudioAdjustmentConfigurationUpdatesWithoutRestartingEngine() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.equalizer")

        try queue.sync {
            let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)
            let configuration = try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: true,
                bandGainsDb: [-4, -3, -1, 0, 1, 2, 6, 1, 0, -1],
                extraVolumeReductionDb: -12
            )

            graph.applyAudioAdjustmentConfiguration(configuration, animated: false)

            XCTAssertTrue(graph.isEngineRunning)
            XCTAssertFalse(graph.isEqualizerBypassed)
            XCTAssertEqual(graph.audioAdjustmentConfigurationSnapshot, configuration)
            XCTAssertEqual(graph.equalizerGlobalGainDb, -19)

            graph.applyAudioAdjustmentConfiguration(.disabled, animated: false)
            XCTAssertTrue(graph.isEngineRunning)
            XCTAssertTrue(graph.isEqualizerBypassed)

            let disabledWithSavedCurve = try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: false,
                bandGainsDb: [0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
                extraVolumeReductionDb: -12
            )
            graph.applyAudioAdjustmentConfiguration(disabledWithSavedCurve, animated: true)
            XCTAssertTrue(graph.isEqualizerBypassed)
            XCTAssertEqual(graph.audioAdjustmentConfigurationSnapshot, disabledWithSavedCurve)
        }
    }

    func testAnimatedDisableFinishesBypassingEqualizer() throws {
        let queue = DispatchQueue(label: "PCMOutputGraphTests.equalizer-disable")
        let finished = expectation(description: "animated equalizer disable")

        queue.async {
            do {
                let graph = try PCMOutputGraph(sampleRate: 44_100, channelCount: 2, ownerQueue: queue)
                let configuration = try AudioAdjustmentConfiguration.validated(
                    specVersion: 1,
                    enabled: true,
                    bandGainsDb: [0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
                    extraVolumeReductionDb: 0
                )
                graph.applyAudioAdjustmentConfiguration(configuration, animated: false)
                graph.applyAudioAdjustmentConfiguration(.disabled, animated: true)

                queue.asyncAfter(deadline: .now() + .milliseconds(75)) {
                    XCTAssertTrue(graph.isEqualizerBypassed)
                    XCTAssertEqual(graph.audioAdjustmentConfigurationSnapshot, .disabled)
                    finished.fulfill()
                }
            } catch {
                XCTFail("Could not create output graph: \(error)")
                finished.fulfill()
            }
        }

        wait(for: [finished], timeout: 1)
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
