import Accelerate
import AVFoundation
import Foundation
import os

final class SpectrumCaptureBufferPool: @unchecked Sendable {
    let maxFrames: Int

    private let pointers: [UnsafeMutablePointer<Float>]
    private let availableIndices = OSAllocatedUnfairLock(initialState: [0, 1, 2])

    init(maxFrames: Int = 4_096) {
        self.maxFrames = maxFrames
        self.pointers = (0..<3).map { _ in
            let pointer = UnsafeMutablePointer<Float>.allocate(capacity: maxFrames)
            pointer.initialize(repeating: 0, count: maxFrames)
            return pointer
        }
    }

    deinit {
        for pointer in pointers {
            pointer.deinitialize(count: maxFrames)
            pointer.deallocate()
        }
    }

    func acquire() -> Int? {
        availableIndices.withLockIfAvailable { $0.popLast() } ?? nil
    }

    func release(_ index: Int) {
        availableIndices.withLock { indices in
            indices.append(index)
        }
    }

    func pointer(for index: Int) -> UnsafeMutablePointer<Float> {
        pointers[index]
    }
}

final class SpectrumSamplePipeline {
    private static let hopSize = SpectrumBandAnalyzer.fftSize / 2

    private let analyzer: SpectrumBandAnalyzer
    private let store: SpectrumSnapshotStore
    private var ring = [Float](repeating: 0, count: SpectrumBandAnalyzer.fftSize)
    private var orderedWindow = [Float](repeating: 0, count: SpectrumBandAnalyzer.fftSize)
    private var writeIndex = 0
    private var filledCount = 0
    private var samplesSinceAnalysis = 0
    private var sampleRate = 0.0

    init?(store: SpectrumSnapshotStore = .shared) {
        guard let analyzer = SpectrumBandAnalyzer() else {
            return nil
        }
        self.analyzer = analyzer
        self.store = store
    }

    func ingest(samples: UnsafeBufferPointer<Float>, sampleRate: Double) {
        guard sampleRate > 0 else { return }
        if self.sampleRate != sampleRate {
            reset(sampleRate: sampleRate)
        }

        for sample in samples {
            ring[writeIndex] = sample
            writeIndex = (writeIndex + 1) % ring.count

            if filledCount < ring.count {
                filledCount += 1
                if filledCount == ring.count {
                    publishFrame()
                    samplesSinceAnalysis = 0
                }
            } else {
                samplesSinceAnalysis += 1
                if samplesSinceAnalysis >= Self.hopSize {
                    publishFrame()
                    samplesSinceAnalysis = 0
                }
            }
        }
    }

    private func reset(sampleRate: Double) {
        self.sampleRate = sampleRate
        ring = [Float](repeating: 0, count: ring.count)
        writeIndex = 0
        filledCount = 0
        samplesSinceAnalysis = 0
    }

    private func publishFrame() {
        for index in orderedWindow.indices {
            orderedWindow[index] = ring[(writeIndex + index) % ring.count]
        }

        let bands = analyzer.analyze(
            samples: orderedWindow,
            sampleRate: sampleRate,
            deltaTime: Double(Self.hopSize) / sampleRate
        )
        store.publish(bands: bands)
    }
}

final class AudioSpectrumTap: @unchecked Sendable {
    private let analysisQueue = DispatchQueue(
        label: "RelistenAudioPlayer.spectrum",
        qos: .userInitiated
    )
    private let bufferPool = SpectrumCaptureBufferPool()
    private let pipeline: SpectrumSamplePipeline?
    private let store: SpectrumSnapshotStore
    private weak var tappedNode: AVAudioNode?

    init(store: SpectrumSnapshotStore = .shared) {
        self.store = store
        self.pipeline = SpectrumSamplePipeline(store: store)
    }

    deinit {
        detach()
    }

    func attach(to node: AVAudioNode) {
        detach()
        tappedNode = node
        node.installTap(onBus: 0, bufferSize: 1_024, format: nil) { [weak self] buffer, _ in
            self?.capture(buffer)
        }
    }

    func detach() {
        tappedNode?.removeTap(onBus: 0)
        tappedNode = nil
    }

    private func capture(_ buffer: AVAudioPCMBuffer) {
        guard store.hasActiveConsumers,
              let bufferIndex = bufferPool.acquire() else {
            return
        }

        let destination = bufferPool.pointer(for: bufferIndex)
        let frameCount = Self.copyMonoSamples(
            from: buffer,
            into: destination,
            maxFrames: bufferPool.maxFrames
        )
        guard frameCount > 0 else {
            bufferPool.release(bufferIndex)
            return
        }

        let sampleRate = buffer.format.sampleRate
        let bufferPool = bufferPool
        analysisQueue.async { [weak self] in
            defer { bufferPool.release(bufferIndex) }
            guard let self, let pipeline = self.pipeline else { return }
            let capturedSamples = bufferPool.pointer(for: bufferIndex)
            pipeline.ingest(
                samples: UnsafeBufferPointer(start: capturedSamples, count: frameCount),
                sampleRate: sampleRate
            )
        }
    }

    static func copyMonoSamples(
        from buffer: AVAudioPCMBuffer,
        into destination: UnsafeMutablePointer<Float>,
        maxFrames: Int
    ) -> Int {
        guard let channelData = buffer.floatChannelData else { return 0 }
        let frameCount = min(Int(buffer.frameLength), maxFrames)
        let channelCount = Int(buffer.format.channelCount)
        guard frameCount > 0, channelCount > 0 else { return 0 }

        if buffer.format.isInterleaved {
            let source = channelData[0]
            for frame in 0..<frameCount {
                var sum: Float = 0
                for channel in 0..<channelCount {
                    sum += source[frame * channelCount + channel]
                }
                destination[frame] = sum / Float(channelCount)
            }
            return frameCount
        }

        if channelCount == 1 {
            destination.update(from: channelData[0], count: frameCount)
            return frameCount
        }

        destination.update(from: channelData[0], count: frameCount)
        for channel in 1..<channelCount {
            vDSP_vadd(
                destination,
                1,
                channelData[channel],
                1,
                destination,
                1,
                vDSP_Length(frameCount)
            )
        }
        var inverseChannelCount = 1 / Float(channelCount)
        vDSP_vsmul(
            destination,
            1,
            &inverseChannelCount,
            destination,
            1,
            vDSP_Length(frameCount)
        )
        return frameCount
    }
}
