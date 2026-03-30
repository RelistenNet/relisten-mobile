import Foundation

struct MP3GaplessMetadataParser {
    private static let maxSyncSearchBytes = 131_072
    private static let headerMatchMask: UInt32 = 0xFFFE0C00

    struct ParsedID3Info {
        var encoderDelay: Int?
        var encoderPadding: Int?
        var dataStartOffset: Int
    }

    struct MPEGAudioHeader: Equatable {
        var rawValue: UInt32
        var versionBits: UInt32
        var layerBits: UInt32
        var bitrate: Int
        var sampleRate: Int
        var channelCount: Int
        var samplesPerFrame: Int
        var frameSize: Int
        var channelModeBits: UInt32

        var isMPEG1: Bool {
            versionBits == 0b11
        }
    }

    struct SeekHeaderInfo {
        var kind: MP3TrackMetadata.SeekHeaderKind
        var frameCount: Int?
        var dataSize: Int?
        var toc: [UInt8]?
        var vbriSeekTable: MP3TrackMetadata.VBRISeekTable?
        var encoderDelay: Int?
        var encoderPadding: Int?
    }

    static func requiredPrefixLength(for data: Data, defaultLimit: Int = 256 * 1024) -> Int {
        guard data.count >= 10,
              String(data: data.prefix(3), encoding: .isoLatin1) == "ID3",
              let tagSize = ByteReader(data: data).readSynchsafeInt(at: 6) else {
            return defaultLimit
        }
        return max(defaultLimit, 10 + tagSize + maxSyncSearchBytes)
    }

    func parse(source: GaplessPlaybackSource, data: Data, fingerprint: CacheFingerprint = .init()) throws -> MP3TrackMetadata {
        let reader = ByteReader(data: data)
        let id3Info = try parseID3(data: data, reader: reader)
        let firstFrameOffset = try findFirstMPEGFrameOffset(data: data, startOffset: id3Info.dataStartOffset)
        let header = try parseHeader(at: firstFrameOffset, in: data)
        let seekHeader = try parseSeekHeader(data: data, frameOffset: firstFrameOffset, header: header)

        let delay = id3Info.encoderDelay ?? seekHeader.encoderDelay ?? 0
        let padding = id3Info.encoderPadding ?? seekHeader.encoderPadding ?? 0
        let durationUs = seekHeader.frameCount.map {
            let totalSamples = max(Int64($0 * header.samplesPerFrame) - 1, 0)
            return (totalSamples * 1_000_000) / Int64(header.sampleRate)
        }
        let dataEndOffset = seekHeader.dataSize.map { Int64(firstFrameOffset + $0 - 1) }

        return MP3TrackMetadata(
            sourceID: source.id,
            sourceURL: source.url,
            cacheKey: source.cacheKey,
            fingerprint: fingerprint,
            firstAudioFrameOffset: Int64(firstFrameOffset),
            dataStartOffset: Int64(firstFrameOffset),
            dataEndOffset: dataEndOffset,
            seekHeaderKind: seekHeader.kind,
            sampleRate: header.sampleRate,
            channelCount: header.channelCount,
            samplesPerFrame: header.samplesPerFrame,
            firstFrameByteLength: header.frameSize,
            estimatedBitrate: header.bitrate,
            durationUs: durationUs,
            encoderDelayFrames: delay,
            encoderPaddingFrames: padding,
            xingToc: seekHeader.toc,
            vbriSeekTable: seekHeader.vbriSeekTable
        )
    }

    private func parseID3(data: Data, reader: ByteReader) throws -> ParsedID3Info {
        guard data.count >= 10 else {
            throw GaplessMP3PlayerError.insufficientData("Need at least 10 bytes to inspect ID3 header")
        }

        guard String(data: data.prefix(3), encoding: .isoLatin1) == "ID3" else {
            return ParsedID3Info(dataStartOffset: 0)
        }

        guard let tagSize = reader.readSynchsafeInt(at: 6) else {
            throw GaplessMP3PlayerError.invalidMP3("Invalid ID3 size")
        }

        let majorVersion = Int(data[3])
        let totalSize = 10 + tagSize
        guard data.count >= totalSize else {
            throw GaplessMP3PlayerError.insufficientData("ID3 tag incomplete")
        }

        var offset = 10
        var encoderDelay: Int?
        var encoderPadding: Int?

        while offset + 10 <= totalSize {
            let frameIDData = data[offset ..< offset + 4]
            if frameIDData.allSatisfy({ $0 == 0 }) {
                break
            }

            guard let frameID = String(data: frameIDData, encoding: .isoLatin1) else { break }

            let frameSize: Int
            if majorVersion == 4 {
                guard let size = reader.readSynchsafeInt(at: offset + 4) else { break }
                frameSize = size
            } else {
                guard let size = reader.readUInt32BE(at: offset + 4) else { break }
                frameSize = Int(size)
            }

            guard frameSize > 0, offset + 10 + frameSize <= totalSize else { break }
            let frameData = data[(offset + 10) ..< (offset + 10 + frameSize)]

            if frameID == "COMM", let parsed = parseCommentFrame(Data(frameData)) {
                encoderDelay = parsed.0
                encoderPadding = parsed.1
            } else if frameID == "----", let parsed = parseInternalFrame(Data(frameData)) {
                encoderDelay = parsed.0
                encoderPadding = parsed.1
            }

            offset += 10 + frameSize
        }

        return ParsedID3Info(
            encoderDelay: encoderDelay,
            encoderPadding: encoderPadding,
            dataStartOffset: totalSize
        )
    }

    private func parseCommentFrame(_ frameData: Data) -> (Int, Int)? {
        guard frameData.count > 4 else { return nil }
        let textEncoding = frameData[0]
        let payload = frameData.dropFirst(4)
        let parts = splitEncodedStrings(Data(payload), encoding: textEncoding, expectedParts: 2)
        guard parts.count >= 2, parts[0] == "iTunSMPB" else { return nil }
        return parseITunSMPB(parts[1])
    }

    private func parseInternalFrame(_ frameData: Data) -> (Int, Int)? {
        guard let textEncoding = frameData.first else { return nil }
        let bytes = Array(frameData)
        var offset = 1

        guard let owner = readLatin1CString(bytes, offset: &offset), owner == "com.apple.iTunes",
              let description = readEncodedCString(bytes, offset: &offset, encoding: textEncoding), description == "iTunSMPB" else {
            return nil
        }

        let remaining = Data(bytes[offset...])
        let value = decodeEncodedString(remaining, encoding: textEncoding)
        return parseITunSMPB(value)
    }

    private func findFirstMPEGFrameOffset(data: Data, startOffset: Int) throws -> Int {
        let searchLimit = min(data.count - 4, startOffset + Self.maxSyncSearchBytes)
        var offset = startOffset

        while offset < searchLimit {
            guard let header = try? parseHeader(at: offset, in: data) else {
                offset += 1
                continue
            }

            if validateConsecutiveFrames(data: data, startOffset: offset, firstHeader: header) {
                return offset
            }

            offset += 1
        }

        throw GaplessMP3PlayerError.invalidMP3("Could not find 4 consecutive MPEG frames")
    }

    private func validateConsecutiveFrames(data: Data, startOffset: Int, firstHeader: MPEGAudioHeader) -> Bool {
        var offset = startOffset
        let targetMask = firstHeader.rawValue & Self.headerMatchMask
        for index in 0 ..< 4 {
            guard let header = try? parseHeader(at: offset, in: data) else { return false }
            if (header.rawValue & Self.headerMatchMask) != targetMask {
                return false
            }
            if index < 3 {
                offset += header.frameSize
                if offset + 4 > data.count {
                    return false
                }
            }
        }
        return firstHeader.frameSize > 0
    }

    private func parseHeader(at offset: Int, in data: Data) throws -> MPEGAudioHeader {
        let reader = ByteReader(data: data)
        guard let rawHeader = reader.readUInt32BE(at: offset) else {
            throw GaplessMP3PlayerError.insufficientData("Incomplete MPEG header")
        }
        guard (rawHeader & 0xFFE00000) == 0xFFE00000 else {
            throw GaplessMP3PlayerError.invalidMP3("Missing MPEG sync")
        }

        let versionBits = (rawHeader >> 19) & 0x3
        let layerBits = (rawHeader >> 17) & 0x3
        let bitrateIndex = Int((rawHeader >> 12) & 0xF)
        let sampleRateIndex = Int((rawHeader >> 10) & 0x3)
        let padding = Int((rawHeader >> 9) & 0x1)
        let channelModeBits = (rawHeader >> 6) & 0x3

        guard versionBits != 0b01 else {
            throw GaplessMP3PlayerError.invalidMP3("Reserved MPEG version")
        }
        guard layerBits == 0b01 else {
            throw GaplessMP3PlayerError.invalidMP3("Only Layer III is supported")
        }
        guard bitrateIndex > 0, bitrateIndex < 15 else {
            throw GaplessMP3PlayerError.invalidMP3("Free bitrate and invalid bitrate indices are unsupported")
        }
        guard sampleRateIndex < 3 else {
            throw GaplessMP3PlayerError.invalidMP3("Invalid sample rate index")
        }

        let sampleRateTable: [UInt32: [Int]] = [
            0b11: [44_100, 48_000, 32_000],
            0b10: [22_050, 24_000, 16_000],
            0b00: [11_025, 12_000, 8_000],
        ]

        let bitrateTable: [UInt32: [Int]] = [
            0b11: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
            0b10: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
            0b00: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        ]

        guard let sampleRate = sampleRateTable[versionBits]?[safe: sampleRateIndex],
              let bitrateKbps = bitrateTable[versionBits]?[safe: bitrateIndex - 1] else {
            throw GaplessMP3PlayerError.invalidMP3("Unsupported bitrate or sample rate")
        }

        let samplesPerFrame = versionBits == 0b11 ? 1_152 : 576
        let bitrate = bitrateKbps * 1_000
        let frameSize = versionBits == 0b11
            ? (144 * bitrate / sampleRate) + padding
            : (72 * bitrate / sampleRate) + padding

        guard frameSize > 4 else {
            throw GaplessMP3PlayerError.invalidMP3("Invalid frame size")
        }

        return MPEGAudioHeader(
            rawValue: rawHeader,
            versionBits: versionBits,
            layerBits: layerBits,
            bitrate: bitrate,
            sampleRate: sampleRate,
            channelCount: channelModeBits == 0b11 ? 1 : 2,
            samplesPerFrame: samplesPerFrame,
            frameSize: frameSize,
            channelModeBits: channelModeBits
        )
    }

    private func parseSeekHeader(data: Data, frameOffset: Int, header: MPEGAudioHeader) throws -> SeekHeaderInfo {
        let reader = ByteReader(data: data)
        let xingOffset = xingOffsetForHeader(header)
        if let tag = reader.readUInt32BE(at: frameOffset + xingOffset) {
            if tag == 0x58696E67 || tag == 0x496E666F {
                return try parseXingOrInfoHeader(data: data, frameOffset: frameOffset + xingOffset, tag: tag)
            }
        }

        if let tag = reader.readUInt32BE(at: frameOffset + 36), tag == 0x56425249 {
            return try parseVBRIHeader(data: data, frameOffset: frameOffset + 36, sampleRate: header.sampleRate, samplesPerFrame: header.samplesPerFrame)
        }

        return SeekHeaderInfo(
            kind: .none,
            frameCount: nil,
            dataSize: nil,
            toc: nil,
            vbriSeekTable: nil,
            encoderDelay: nil,
            encoderPadding: nil
        )
    }

    private func xingOffsetForHeader(_ header: MPEGAudioHeader) -> Int {
        if header.isMPEG1 {
            return header.channelCount == 1 ? 21 : 36
        }
        return header.channelCount == 1 ? 13 : 21
    }

    private func parseXingOrInfoHeader(data: Data, frameOffset: Int, tag: UInt32) throws -> SeekHeaderInfo {
        let reader = ByteReader(data: data)
        guard let flags = reader.readUInt32BE(at: frameOffset + 4) else {
            throw GaplessMP3PlayerError.insufficientData("Missing Xing/Info flags")
        }
        var cursor = frameOffset + 8
        var frameCount: Int?
        var dataSize: Int?
        var toc: [UInt8]?

        if (flags & 0x1) != 0 {
            guard let value = reader.readUInt32BE(at: cursor) else {
                throw GaplessMP3PlayerError.insufficientData("Missing Xing frame count")
            }
            frameCount = Int(value)
            cursor += 4
        }
        if (flags & 0x2) != 0 {
            guard let value = reader.readUInt32BE(at: cursor) else {
                throw GaplessMP3PlayerError.insufficientData("Missing Xing data size")
            }
            dataSize = Int(value)
            cursor += 4
        }
        if (flags & 0x4) != 0 {
            guard cursor + 100 <= data.count else {
                throw GaplessMP3PlayerError.insufficientData("Incomplete Xing TOC")
            }
            toc = Array(data[cursor ..< cursor + 100])
            cursor += 100
        }
        if (flags & 0x8) != 0 {
            cursor += 4
        }

        var encoderDelay: Int?
        var encoderPadding: Int?
        if cursor + 24 <= data.count, let rawDelayPadding = reader.readUInt24BE(at: cursor + 21) {
            encoderDelay = Int((rawDelayPadding >> 12) & 0xFFF)
            encoderPadding = Int(rawDelayPadding & 0xFFF)
        }

        return SeekHeaderInfo(
            kind: tag == 0x58696E67 ? .xing : .info,
            frameCount: frameCount,
            dataSize: dataSize,
            toc: toc,
            vbriSeekTable: nil,
            encoderDelay: encoderDelay,
            encoderPadding: encoderPadding
        )
    }

    private func parseVBRIHeader(data: Data, frameOffset: Int, sampleRate: Int, samplesPerFrame: Int) throws -> SeekHeaderInfo {
        let reader = ByteReader(data: data)
        guard let delay = reader.readUInt16BE(at: frameOffset + 6),
              let bytes = reader.readUInt32BE(at: frameOffset + 10),
              let frames = reader.readUInt32BE(at: frameOffset + 14),
              let entryCount = reader.readUInt16BE(at: frameOffset + 18),
              let scale = reader.readUInt16BE(at: frameOffset + 20),
              let entryByteSize = reader.readUInt16BE(at: frameOffset + 22),
              let framesPerEntry = reader.readUInt16BE(at: frameOffset + 24) else {
            throw GaplessMP3PlayerError.insufficientData("Incomplete VBRI header")
        }

        let frameCount = Int(frames)
        let parsedTable = parseVBRISeekTable(
            data: data,
            tableOffset: frameOffset + 26,
            frameCount: frameCount,
            entryCount: Int(entryCount),
            scale: Int(scale),
            entryByteSize: Int(entryByteSize),
            framesPerEntry: Int(framesPerEntry)
        )

        _ = sampleRate
        _ = samplesPerFrame

        return SeekHeaderInfo(
            kind: .vbri,
            frameCount: frameCount,
            dataSize: Int(bytes),
            toc: nil,
            vbriSeekTable: parsedTable,
            encoderDelay: Int(delay),
            encoderPadding: nil
        )
    }

    private func parseVBRISeekTable(
        data: Data,
        tableOffset: Int,
        frameCount: Int,
        entryCount: Int,
        scale: Int,
        entryByteSize: Int,
        framesPerEntry: Int
    ) -> MP3TrackMetadata.VBRISeekTable? {
        guard entryCount > 0, scale > 0, framesPerEntry > 0, (1 ... 4).contains(entryByteSize) else {
            return nil
        }

        let byteCount = entryCount * entryByteSize
        guard tableOffset + byteCount <= data.count else {
            return nil
        }

        var entries: [Int] = []
        entries.reserveCapacity(entryCount)

        for entryIndex in 0 ..< entryCount {
            let offset = tableOffset + (entryIndex * entryByteSize)
            let value: Int?
            switch entryByteSize {
            case 1:
                value = Int(data[offset])
            case 2:
                value = ByteReader(data: data).readUInt16BE(at: offset).map(Int.init)
            case 3:
                value = ByteReader(data: data).readUInt24BE(at: offset).map(Int.init)
            case 4:
                value = ByteReader(data: data).readUInt32BE(at: offset).map(Int.init)
            default:
                value = nil
            }

            guard let value else {
                return nil
            }
            entries.append(value)
        }

        return MP3TrackMetadata.VBRISeekTable(
            entryCount: entryCount,
            scale: scale,
            entryByteSize: entryByteSize,
            framesPerEntry: framesPerEntry,
            frameCount: frameCount,
            entries: entries
        )
    }
}
