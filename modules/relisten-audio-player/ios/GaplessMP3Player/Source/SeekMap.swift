import Foundation

/// The player keeps seeking and gapless trimming separate on purpose.
///
/// The design docs mirror ExoPlayer here: metadata chooses a byte position that is
/// exact, approximate, or unavailable, and the PCM trim engine still removes encoder
/// delay/padding after decode. That split keeps seek math simple and avoids trying to
/// "pre-trim" compressed MP3 frames, which is not sample-accurate.
enum SeekResolutionConfidence: String, Sendable {
    case exact
    case approximate
    case unavailable
}

struct SeekResolution: Sendable {
    var byteOffset: Int64
    var confidence: SeekResolutionConfidence
    var anchorTimeUs: Int64
}

struct TrackSeekPlan: Sendable, Equatable {
    var byteOffset: Int64
    var trimStartFrames: Int
}

/// Resolves logical playback time to a compressed-byte offset.
///
/// We intentionally model only the seek strategies the runtime can defend:
/// Xing TOC and VBRI are treated as exact enough to avoid extra start trimming,
/// CBR is approximate, and "unavailable" falls back to byte-0 style decoding plus
/// PCM trimming. That tradeoff keeps the gapless contract correct even when seek
/// metadata is weak.
struct SeekMap {
    enum Mode: Sendable {
        case xing(toc: [UInt8], durationUs: Int64, dataStartOffset: Int64, dataSize: Int64)
        case vbri(durationUs: Int64, dataStartOffset: Int64, dataSize: Int64, table: MP3TrackMetadata.VBRISeekTable)
        case cbr(
            durationUs: Int64,
            bitrate: Int,
            dataStartOffset: Int64,
            dataSize: Int64?,
            samplesPerFrame: Int,
            sampleRate: Int
        )
        case unavailable
    }

    let mode: Mode

    init(metadata: MP3TrackMetadata, bitrate: Int? = nil) {
        // Prefer seek tables because they describe the file's actual byte layout.
        // Only fall back to bitrate math when the parser explicitly marked the
        // stream as constant-bitrate; duration plus first-frame bitrate alone is
        // common in VBR metadata and would seek to the wrong region.
        if let toc = metadata.xingToc,
           let durationUs = metadata.durationUs,
           let dataEndOffset = metadata.dataEndOffset {
            self.mode = .xing(
                toc: toc,
                durationUs: durationUs,
                dataStartOffset: metadata.dataStartOffset,
                dataSize: max(dataEndOffset - metadata.dataStartOffset + 1, 0)
            )
        } else if metadata.seekHeaderKind == .vbri,
                  let durationUs = metadata.durationUs,
                  let dataEndOffset = metadata.dataEndOffset,
                  let vbriSeekTable = metadata.vbriSeekTable {
            self.mode = .vbri(
                durationUs: durationUs,
                dataStartOffset: metadata.dataStartOffset,
                dataSize: max(dataEndOffset - metadata.dataStartOffset + 1, 0),
                table: vbriSeekTable
            )
        } else if metadata.approximateSeekStrategy == .constantBitrate,
                  let durationUs = metadata.durationUs,
                  let bitrate {
            self.mode = .cbr(
                durationUs: durationUs,
                bitrate: bitrate,
                dataStartOffset: metadata.dataStartOffset,
                dataSize: metadata.dataEndOffset.map { max($0 - metadata.dataStartOffset + 1, 0) },
                samplesPerFrame: metadata.samplesPerFrame,
                sampleRate: metadata.sampleRate
            )
        } else {
            self.mode = .unavailable
        }
    }

    /// Returns the best known compressed-byte position for the target logical time.
    ///
    /// The output byte offset is always clamped into the valid audio data region.
    /// When the result is approximate or unavailable, callers are expected to decode
    /// from that point and let the trim/timeline layer absorb the inaccuracy.
    func resolve(timeUs: Int64) -> SeekResolution {
        switch mode {
        case .xing(let toc, let durationUs, let dataStartOffset, let dataSize):
            let duration = max(durationUs, 1)
            let clampedTimeUs = max(0, min(timeUs, durationUs))
            let percent = max(0, min(Double(clampedTimeUs) * 100.0 / Double(duration), 100))
            let previousIndex = min(99, max(0, Int(floor(percent))))
            let previousScaled = Double(toc[previousIndex])
            let nextScaled = previousIndex == 99 ? 256.0 : Double(toc[previousIndex + 1])
            let fraction = percent - Double(previousIndex)
            let scaledPosition = previousScaled + fraction * (nextScaled - previousScaled)
            let byteOffset = Int64(round((scaledPosition / 256.0) * Double(dataSize)))
            let absoluteOffset = dataStartOffset + max(0, min(byteOffset, dataSize - 1))
            return SeekResolution(byteOffset: absoluteOffset, confidence: .exact, anchorTimeUs: clampedTimeUs)
        case .vbri(let durationUs, let dataStartOffset, let dataSize, let table):
            let clampedTimeUs = max(0, min(timeUs, durationUs))
            let clampedFrameIndex = min(
                max(Int((Double(clampedTimeUs) / Double(max(durationUs, 1))) * Double(table.frameCount)), 0),
                max(table.frameCount - 1, 0)
            )
            let completedEntryCount = min(clampedFrameIndex / table.framesPerEntry, max(table.entries.count - 1, 0))
            let framesBeforeEntry = completedEntryCount * table.framesPerEntry
            let remainingFramesInEntry = max(table.frameCount - framesBeforeEntry, 1)
            let segmentFrameCount = min(table.framesPerEntry, remainingFramesInEntry)
            let frameOffsetWithinEntry = max(clampedFrameIndex - framesBeforeEntry, 0)
            let bytesBeforeEntry = table.entries.prefix(completedEntryCount).reduce(Int64.zero) {
                $0 + (Int64($1) * Int64(table.scale))
            }
            let entryByteCount = Int64(table.entries[completedEntryCount]) * Int64(table.scale)
            let fractionWithinEntry = Double(frameOffsetWithinEntry) / Double(max(segmentFrameCount, 1))
            let byteOffsetWithinData = bytesBeforeEntry + Int64(Double(entryByteCount) * fractionWithinEntry)
            return SeekResolution(
                byteOffset: dataStartOffset + max(0, min(byteOffsetWithinData, dataSize - 1)),
                confidence: .exact,
                anchorTimeUs: clampedTimeUs
            )
        case .cbr(let durationUs, let bitrate, let dataStartOffset, let dataSize, let samplesPerFrame, let sampleRate):
            guard durationUs > 0 else {
                return SeekResolution(byteOffset: dataStartOffset, confidence: .unavailable, anchorTimeUs: 0)
            }

            let clampedTimeUs = max(0, min(timeUs, durationUs))

            // Seek to the frame before the requested one. Decoders need to start on
            // compressed-frame boundaries, and the trim layer removes the extra PCM
            // after decode so the public timeline still lands on the requested time.
            let targetRawFrames = (clampedTimeUs * Int64(sampleRate)) / 1_000_000
            let targetFrameIndex = max(targetRawFrames / Int64(max(samplesPerFrame, 1)), 0)
            let anchorFrameIndex = max(targetFrameIndex - 1, 0)
            let anchorRawFrames = anchorFrameIndex * Int64(samplesPerFrame)

            // Use bitrate/time for CBR byte position rather than first-frame length.
            // CBR MP3s can still use one-byte padding, so multiplying by the first
            // frame size drifts over long seeks.
            let byteOffsetWithinData = (anchorRawFrames * Int64(max(bitrate, 1))) /
                (Int64(max(sampleRate, 1)) * 8)
            let clampedByteOffset = if let dataSize {
                max(0, min(byteOffsetWithinData, max(dataSize - 1, 0)))
            } else {
                max(0, byteOffsetWithinData)
            }
            let anchorTimeUs = (anchorRawFrames * 1_000_000) / Int64(sampleRate)
            return SeekResolution(
                byteOffset: dataStartOffset + clampedByteOffset,
                confidence: .approximate,
                anchorTimeUs: anchorTimeUs
            )
        case .unavailable:
            return SeekResolution(byteOffset: 0, confidence: .unavailable, anchorTimeUs: 0)
        }
    }
}

enum TrackSeekPlanner {
    static func plan(metadata: MP3TrackMetadata, startTime: TimeInterval) -> TrackSeekPlan {
        guard startTime > 0 else {
            return TrackSeekPlan(byteOffset: metadata.dataStartOffset, trimStartFrames: metadata.encoderDelayFrames)
        }

        let logicalStartFrames = Int64(startTime * Double(metadata.sampleRate))
        let rawStartFrames = logicalStartFrames + Int64(metadata.encoderDelayFrames)
        let rawStartTimeUs = (rawStartFrames * 1_000_000) / Int64(metadata.sampleRate)
        let resolution = SeekMap(metadata: metadata, bitrate: metadata.estimatedBitrate).resolve(timeUs: rawStartTimeUs)

        // The seek map anchors in raw decoded samples. Subtracting that anchor from
        // the desired raw start gives the PCM frames to discard after the decoder
        // starts producing audio.
        let anchorRawFrames = (resolution.anchorTimeUs * Int64(metadata.sampleRate)) / 1_000_000
        let trimStartFrames = Int(max(rawStartFrames - anchorRawFrames, 0))

        return TrackSeekPlan(
            byteOffset: max(metadata.dataStartOffset, resolution.byteOffset),
            trimStartFrames: trimStartFrames
        )
    }
}
