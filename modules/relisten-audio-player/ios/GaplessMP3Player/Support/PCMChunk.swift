import AVFoundation
import Foundation

/// Lightweight PCM container used between decode, trim, and output scheduling.
///
/// The engine keeps PCM as planar Float32 arrays because that matches the trim logic
/// well and maps cleanly onto `AVAudioPCMBuffer` when we finally schedule audio.
/// This is intentionally not a general-purpose audio buffer abstraction; it only
/// carries the invariants the gapless pipeline needs.
struct PCMChunk: Sendable {
    let sampleRate: Double
    let channelCount: Int
    var channels: [[Float]]

    init(sampleRate: Double, channels: [[Float]]) {
        self.sampleRate = sampleRate
        self.channels = channels
        self.channelCount = channels.count
    }

    var frameCount: Int {
        channels.first?.count ?? 0
    }

    var isEmpty: Bool {
        frameCount == 0
    }

    /// Drops decoded frames from the front after seeking or start trimming.
    func droppingFirst(_ frames: Int) -> PCMChunk {
        guard frames > 0, frames < frameCount else {
            if frames >= frameCount {
                return PCMChunk(sampleRate: sampleRate, channels: channels.map { _ in [] })
            }
            return self
        }
        return PCMChunk(sampleRate: sampleRate, channels: channels.map { Array($0.dropFirst(frames)) })
    }

    func prefix(_ frames: Int) -> PCMChunk {
        guard frames > 0 else {
            return PCMChunk(sampleRate: sampleRate, channels: channels.map { _ in [] })
        }
        if frames >= frameCount {
            return self
        }
        return PCMChunk(sampleRate: sampleRate, channels: channels.map { Array($0.prefix(frames)) })
    }

    func suffix(_ frames: Int) -> PCMChunk {
        guard frames > 0 else {
            return PCMChunk(sampleRate: sampleRate, channels: channels.map { _ in [] })
        }
        if frames >= frameCount {
            return self
        }
        return PCMChunk(sampleRate: sampleRate, channels: channels.map { Array($0.suffix(frames)) })
    }

    /// Concatenates adjacent decoded PCM without reformatting.
    ///
    /// We require matching channel topology because all runtime transitions enforce
    /// a stable sample rate and channel count up front during `prepare`.
    func appended(with other: PCMChunk) -> PCMChunk {
        precondition(channelCount == other.channelCount)
        let merged = zip(channels, other.channels).map { lhs, rhs in
            var combined = lhs
            combined.append(contentsOf: rhs)
            return combined
        }
        return PCMChunk(sampleRate: sampleRate, channels: merged)
    }

    /// Bridges the internal planar representation into AVFoundation on demand.
    ///
    /// The player keeps AVFoundation out of the core trim/seek logic so those layers
    /// stay deterministic and easy to test. Conversion happens only at the boundary
    /// where audio is scheduled or exported.
    func toAVAudioPCMBuffer(interleaved: Bool = false) throws -> AVAudioPCMBuffer {
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: AVAudioChannelCount(channelCount),
            interleaved: interleaved
        ) else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not construct AVAudioFormat")
        }

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not construct AVAudioPCMBuffer")
        }

        buffer.frameLength = AVAudioFrameCount(frameCount)
        if interleaved {
            guard let channelData = buffer.floatChannelData?.pointee else {
                throw GaplessMP3PlayerError.unsupportedFormat("Missing interleaved channel data")
            }
            for frameIndex in 0 ..< frameCount {
                for channelIndex in 0 ..< channelCount {
                    channelData[(frameIndex * channelCount) + channelIndex] = channels[channelIndex][frameIndex]
                }
            }
        } else {
            for channelIndex in 0 ..< channelCount {
                guard let destination = buffer.floatChannelData?[channelIndex] else { continue }
                channels[channelIndex].withUnsafeBufferPointer { source in
                    destination.update(from: source.baseAddress!, count: frameCount)
                }
            }
        }
        return buffer
    }

    /// Pulls PCM back out of AVFoundation for tests and offline export paths.
    static func from(buffer: AVAudioPCMBuffer) -> PCMChunk {
        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        var channels: [[Float]] = []
        channels.reserveCapacity(channelCount)
        for channelIndex in 0 ..< channelCount {
            let pointer = buffer.floatChannelData![channelIndex]
            channels.append(Array(UnsafeBufferPointer(start: pointer, count: frameCount)))
        }
        return PCMChunk(sampleRate: buffer.format.sampleRate, channels: channels)
    }

    /// Convenience constructor used by tests and by any future underrun fill policy.
    static func silence(sampleRate: Double, channelCount: Int, frameCount: Int) -> PCMChunk {
        PCMChunk(sampleRate: sampleRate, channels: Array(repeating: Array(repeating: 0, count: frameCount), count: channelCount))
    }
}
