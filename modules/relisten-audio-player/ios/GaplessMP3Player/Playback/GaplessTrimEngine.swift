import Foundation

/// PCM-stage implementation of gapless trimming.
///
/// This follows the same core idea as ExoPlayer's trimming processor: decode every
/// MP3 frame that belongs to the track, then remove encoder delay at the head and
/// encoder padding at the tail in PCM. We intentionally do not mutate the compressed
/// stream because MP3 frame boundaries are coarser than the sample-accurate trim we
/// need.
final class GaplessTrimEngine {
    private var pendingStartFrames: Int
    private let endFrames: Int
    private let sampleRate: Double
    private var tailChannels: [[Float]]
    private(set) var emittedFrames: Int64 = 0
    private(set) var trimmedFrames: Int64 = 0

    init(channelCount: Int, sampleRate: Double, startFrames: Int, endFrames: Int) {
        self.pendingStartFrames = max(0, startFrames)
        self.endFrames = max(0, endFrames)
        self.sampleRate = sampleRate
        self.tailChannels = Array(repeating: [], count: channelCount)
    }

    /// Pushes one decoded chunk through the start-trim and rolling-tail stages.
    ///
    /// The method can return `nil` even when more audio is coming. That is expected
    /// whenever we are still consuming encoder delay or building enough tail history
    /// to know which frames are safe to emit.
    func process(_ chunk: PCMChunk) -> PCMChunk? {
        guard !chunk.isEmpty else { return nil }

        var input = chunk
        if pendingStartFrames > 0 {
            let skip = min(input.frameCount, pendingStartFrames)
            trimmedFrames += Int64(skip)
            pendingStartFrames -= skip
            input = input.droppingFirst(skip)
            if input.isEmpty {
                return nil
            }
        }

        if endFrames == 0 {
            emittedFrames += Int64(input.frameCount)
            return input
        }

        let combined = zip(tailChannels, input.channels).map { existing, incoming -> [Float] in
            var merged = existing
            merged.append(contentsOf: incoming)
            return merged
        }

        let overflowFrames = max(0, (combined.first?.count ?? 0) - endFrames)
        guard overflowFrames > 0 else {
            tailChannels = combined
            return nil
        }

        let outputChannels = combined.map { Array($0.prefix(overflowFrames)) }
        tailChannels = combined.map { Array($0.suffix(endFrames)) }
        emittedFrames += Int64(overflowFrames)
        return PCMChunk(sampleRate: chunk.sampleRate, channels: outputChannels)
    }

    /// Drops the retained tail at a track boundary so encoder padding never leaks into
    /// the next track's PCM timeline.
    func finishForTransition() {
        tailChannels = tailChannels.map { _ in [] }
    }

    /// Finalizes the last track in the queue.
    ///
    /// Production playback drops encoder padding here. Tests also exercise the
    /// non-dropping path because retaining the tail is useful when validating the
    /// engine's frame accounting in isolation.
    func finishFinalTrack(dropFinalPadding: Bool) -> PCMChunk? {
        guard !dropFinalPadding else {
            trimmedFrames += Int64(tailChannels.first?.count ?? 0)
            tailChannels = tailChannels.map { _ in [] }
            return nil
        }

        let output = PCMChunk(sampleRate: sampleRate, channels: tailChannels)
        emittedFrames += Int64(output.frameCount)
        tailChannels = tailChannels.map { _ in [] }
        return output.isEmpty ? nil : output
    }

    /// Clears retained tail state after seek/reset style operations.
    func clearTail() {
        tailChannels = tailChannels.map { _ in [] }
    }
}
