@preconcurrency import AVFoundation
import Foundation

/// Fixed output format for one playback session.
///
/// This stays engine-local so relisten can mirror the legacy BASS "one mixer format,
/// mixed inputs allowed" behavior without pushing format policy into the backend bridge.
struct PlaybackSessionOutputFormat: Sendable, Equatable {
    let sampleRate: Double
    let channelCount: Int

    static let bassLike = PlaybackSessionOutputFormat(sampleRate: 44_100, channelCount: 2)

    func canNormalize(sampleRate: Int, channelCount: Int) -> Bool {
        sampleRate > 0 && (1...2).contains(channelCount)
    }
}

/// Normalizes trimmed PCM into the fixed playback-session output format.
///
/// The converter must stay stateful across chunks because sample-rate conversion keeps
/// internal filter state. Recreating it per chunk would risk discontinuities and tail loss.
final class PCMFormatNormalizer {
    private final class ConversionInputBox: @unchecked Sendable {
        var buffer: AVAudioPCMBuffer?

        init(buffer: AVAudioPCMBuffer?) {
            self.buffer = buffer
        }
    }

    private let outputFormat: PlaybackSessionOutputFormat
    private let converter: AVAudioConverter?

    init(inputSampleRate: Double, inputChannelCount: Int, outputFormat: PlaybackSessionOutputFormat) throws {
        guard outputFormat.canNormalize(sampleRate: Int(inputSampleRate), channelCount: inputChannelCount) else {
            throw GaplessMP3PlayerError.unsupportedFormat(
                "Unsupported normalization format: \(inputSampleRate) Hz / \(inputChannelCount) ch"
            )
        }

        self.outputFormat = outputFormat

        if inputSampleRate == outputFormat.sampleRate, inputChannelCount == outputFormat.channelCount {
            converter = nil
            return
        }

        guard let sourceFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: inputSampleRate,
            channels: AVAudioChannelCount(outputFormat.channelCount),
            interleaved: false
        ), let destinationFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: outputFormat.sampleRate,
            channels: AVAudioChannelCount(outputFormat.channelCount),
            interleaved: false
        ), let converter = AVAudioConverter(from: sourceFormat, to: destinationFormat) else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not construct PCM format converter")
        }

        self.converter = converter
    }

    func normalize(_ chunk: PCMChunk) throws -> PCMChunk? {
        guard !chunk.isEmpty else {
            return nil
        }

        let channelNormalized = try chunk.normalizedChannelCount(outputFormat.channelCount)
        guard channelNormalized.sampleRate != outputFormat.sampleRate else {
            return channelNormalized
        }
        return try convert(channelNormalized, endOfStream: false)
    }

    /// Drains any resampler-retained frames after the producer has fully finished.
    func flush() throws -> PCMChunk? {
        guard converter != nil else {
            return nil
        }
        return try convert(nil, endOfStream: true)
    }

    private func convert(_ chunk: PCMChunk?, endOfStream: Bool) throws -> PCMChunk? {
        guard let converter else {
            return chunk
        }

        let estimatedFrameCount: Int
        if let chunk {
            let ratio = outputFormat.sampleRate / max(chunk.sampleRate, 1)
            estimatedFrameCount = max(Int(ceil(Double(chunk.frameCount) * ratio)) + 64, 64)
        } else {
            estimatedFrameCount = 512
        }

        guard let destinationFormat = converter.outputFormat as AVAudioFormat?,
              let outputBuffer = AVAudioPCMBuffer(
                pcmFormat: destinationFormat,
                frameCapacity: AVAudioFrameCount(estimatedFrameCount)
              ) else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not allocate normalization buffer")
        }

        let inputBox = ConversionInputBox(
            buffer: try chunk?.toAVAudioPCMBuffer(interleaved: false)
        )
        var conversionError: NSError?
        let status = converter.convert(to: outputBuffer, error: &conversionError) { _, outStatus in
            if let inputBuffer = inputBox.buffer {
                inputBox.buffer = nil
                outStatus.pointee = .haveData
                return inputBuffer
            }

            outStatus.pointee = endOfStream ? .endOfStream : .noDataNow
            return nil
        }

        if let conversionError {
            throw GaplessMP3PlayerError.unsupportedFormat(
                "PCM normalization failed: \(conversionError.localizedDescription)"
            )
        }

        switch status {
        case .haveData, .inputRanDry, .endOfStream:
            let normalized = PCMChunk.from(buffer: outputBuffer)
            return normalized.isEmpty ? nil : normalized
        case .error:
            throw GaplessMP3PlayerError.unsupportedFormat("PCM normalization failed with converter error")
        @unknown default:
            throw GaplessMP3PlayerError.unsupportedFormat("PCM normalization returned an unknown converter status")
        }
    }
}
