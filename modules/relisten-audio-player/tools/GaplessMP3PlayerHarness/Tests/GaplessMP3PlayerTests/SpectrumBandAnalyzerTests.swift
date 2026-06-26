import Foundation
import XCTest
@testable import GaplessMP3Player

final class SpectrumBandAnalyzerTests: XCTestCase {
    func testBassFrequencyMapsToLowBands() throws {
        let peak = try peakBand(for: 80)

        XCTAssertLessThan(peak, 12)
    }

    func testMidFrequencyMapsToMiddleBands() throws {
        let peak = try peakBand(for: 1_000)

        XCTAssertTrue((18...32).contains(peak))
    }

    func testHighFrequencyMapsToHighBands() throws {
        let peak = try peakBand(for: 10_000)

        XCTAssertGreaterThan(peak, 38)
    }

    func testSilenceReturnsFlatBands() throws {
        let analyzer = try XCTUnwrap(SpectrumBandAnalyzer())

        let bands = analyzer.analyze(
            samples: [Float](repeating: 0, count: SpectrumBandAnalyzer.fftSize),
            sampleRate: 48_000,
            deltaTime: 1.0 / 30.0
        )

        XCTAssertEqual(bands, SpectrumBandAnalyzer.flatBands)
    }

    func testSignalBelowNoiseFloorReturnsFlatBands() throws {
        let bands = try analyze(frequency: 1_000, amplitude: 0.000_01)

        XCTAssertEqual(bands, SpectrumBandAnalyzer.flatBands)
    }

    func testNormalizationUsesAvailableSignalPeak() throws {
        let fullScaleBands = try analyze(frequency: 1_000, amplitude: 1)
        let quietBands = try analyze(frequency: 1_000, amplitude: 0.01)

        XCTAssertEqual(fullScaleBands.max() ?? 0, 1, accuracy: 0.001)
        XCTAssertEqual(quietBands.max() ?? 0, 1, accuracy: 0.001)
    }

    func testSmootherAttacksFasterThanItReleases() {
        var smoother = SpectrumSmoother(bandCount: 1)

        smoother.update(targets: [1], deltaTime: 0.05)
        let attackedValue = smoother.values[0]
        smoother.update(targets: [0], deltaTime: 0.05)
        let releasedValue = smoother.values[0]

        XCTAssertGreaterThan(attackedValue, 0.6)
        XCTAssertGreaterThan(releasedValue, attackedValue * 0.7)
    }

    func testStaleInputDecaysTowardFlat() {
        var smoother = SpectrumSmoother(bandCount: 1)
        smoother.update(targets: [1], deltaTime: 0.2)

        let liveValue = smoother.values[0]
        smoother.update(targets: [0], deltaTime: 0.22)

        XCTAssertGreaterThan(liveValue, 0.98)
        XCTAssertLessThan(smoother.values[0], liveValue * 0.38)
    }

    func testSnapshotFreshnessUsesStaleInputThreshold() {
        let snapshot = SpectrumSnapshot(bands: [1], capturedAt: 10)

        XCTAssertTrue(snapshot.isFresh(at: 10.149, staleAfter: 0.15))
        XCTAssertFalse(snapshot.isFresh(at: 10.151, staleAfter: 0.15))
        XCTAssertFalse(SpectrumSnapshot.flat.isFresh(at: 0, staleAfter: 0.15))
    }

    func testStereoSamplesAreAveragedToMono() throws {
        let chunk = PCMChunk(
            sampleRate: 48_000,
            channels: [[1, 0.5, -1], [-1, 0.5, 1]]
        )
        let buffer = try chunk.toAVAudioPCMBuffer(interleaved: false)
        let destination = UnsafeMutablePointer<Float>.allocate(capacity: 3)
        defer { destination.deallocate() }

        let count = AudioSpectrumTap.copyMonoSamples(
            from: buffer,
            into: destination,
            maxFrames: 3
        )

        XCTAssertEqual(count, 3)
        XCTAssertEqual(Array(UnsafeBufferPointer(start: destination, count: count)), [0, 0.5, 0])
    }

    func testCaptureBufferPoolDropsWhenAllSlotsAreBusy() throws {
        let pool = SpectrumCaptureBufferPool(maxFrames: 16)
        let first = try XCTUnwrap(pool.acquire())
        _ = try XCTUnwrap(pool.acquire())
        _ = try XCTUnwrap(pool.acquire())

        XCTAssertNil(pool.acquire())

        pool.release(first)
        XCTAssertNotNil(pool.acquire())
    }

    func testSamplePipelinePublishesAfterOneFFTWindow() throws {
        let store = SpectrumSnapshotStore()
        store.beginConsuming()
        defer { store.endConsuming() }
        let pipeline = try XCTUnwrap(SpectrumSamplePipeline(store: store))
        let sampleRate = 48_000.0
        let samples = (0..<SpectrumBandAnalyzer.fftSize).map { frame in
            Float(sin(2 * Double.pi * 1_000 * Double(frame) / sampleRate))
        }

        samples.withUnsafeBufferPointer { buffer in
            pipeline.ingest(samples: buffer, sampleRate: sampleRate)
        }

        XCTAssertGreaterThan(store.snapshot().bands.max() ?? 0, 0.9)
    }

    func testSnapshotStoreTracksConsumersAndLatestFrame() {
        let store = SpectrumSnapshotStore()
        XCTAssertFalse(store.hasActiveConsumers)

        store.beginConsuming()
        store.publish(bands: [0.25], capturedAt: 42)

        XCTAssertTrue(store.hasActiveConsumers)
        XCTAssertEqual(store.snapshot().bands, [0.25])
        XCTAssertEqual(store.snapshot().capturedAt, 42)

        store.endConsuming()
        store.publish(bands: [1], capturedAt: 43)

        XCTAssertFalse(store.hasActiveConsumers)
        XCTAssertEqual(store.snapshot().bands, SpectrumBandAnalyzer.flatBands)
    }

    private func peakBand(for frequency: Double) throws -> Int {
        let bands = try analyze(frequency: frequency)

        return try XCTUnwrap(bands.enumerated().max(by: { $0.element < $1.element })?.offset)
    }

    private func analyze(frequency: Double, amplitude: Double = 1) throws -> [Float] {
        let sampleRate = 48_000.0
        let samples = (0..<SpectrumBandAnalyzer.fftSize).map { frame in
            Float(amplitude * sin(2 * Double.pi * frequency * Double(frame) / sampleRate))
        }
        return try XCTUnwrap(SpectrumBandAnalyzer()).analyze(
            samples: samples,
            sampleRate: sampleRate,
            deltaTime: 1.0 / 30.0
        )
    }
}
