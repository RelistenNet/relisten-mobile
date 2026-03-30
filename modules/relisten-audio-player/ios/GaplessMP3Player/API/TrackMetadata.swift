import Foundation

/// HTTP/file identity captured alongside parsed MP3 metadata.
///
/// This is used both for cache validation and for reporting download state back to the
/// caller after metadata and playback preparation.
public struct CacheFingerprint: Codable, Equatable, Sendable {
    public var contentLength: Int64?
    public var etag: String?
    public var lastModified: String?

    public init(contentLength: Int64? = nil, etag: String? = nil, lastModified: String? = nil) {
        self.contentLength = contentLength
        self.etag = etag
        self.lastModified = lastModified
    }
}

/// Parsed MP3 metadata required for seek resolution, trim calculation, and decode setup.
public struct MP3TrackMetadata: Codable, Equatable, Sendable {
    public struct VBRISeekTable: Codable, Equatable, Sendable {
        public var entryCount: Int
        public var scale: Int
        public var entryByteSize: Int
        public var framesPerEntry: Int
        public var frameCount: Int
        public var entries: [Int]

        public init(
            entryCount: Int,
            scale: Int,
            entryByteSize: Int,
            framesPerEntry: Int,
            frameCount: Int,
            entries: [Int]
        ) {
            self.entryCount = entryCount
            self.scale = scale
            self.entryByteSize = entryByteSize
            self.framesPerEntry = framesPerEntry
            self.frameCount = frameCount
            self.entries = entries
        }
    }

    /// Indicates which seek table, if any, was found in the stream headers.
    public enum SeekHeaderKind: String, Codable, Sendable {
        case none
        case xing
        case info
        case vbri
    }

    public var sourceID: String
    public var sourceURL: URL
    public var cacheKey: String
    public var fingerprint: CacheFingerprint
    public var firstAudioFrameOffset: Int64
    public var dataStartOffset: Int64
    public var dataEndOffset: Int64?
    public var seekHeaderKind: SeekHeaderKind
    public var sampleRate: Int
    public var channelCount: Int
    public var samplesPerFrame: Int
    public var firstFrameByteLength: Int
    public var estimatedBitrate: Int?
    public var durationUs: Int64?
    public var encoderDelayFrames: Int
    public var encoderPaddingFrames: Int
    public var xingToc: [UInt8]?
    public var vbriSeekTable: VBRISeekTable?

    public init(
        sourceID: String,
        sourceURL: URL,
        cacheKey: String,
        fingerprint: CacheFingerprint,
        firstAudioFrameOffset: Int64,
        dataStartOffset: Int64,
        dataEndOffset: Int64?,
        seekHeaderKind: SeekHeaderKind,
        sampleRate: Int,
        channelCount: Int,
        samplesPerFrame: Int,
        firstFrameByteLength: Int = 0,
        estimatedBitrate: Int? = nil,
        durationUs: Int64?,
        encoderDelayFrames: Int,
        encoderPaddingFrames: Int,
        xingToc: [UInt8]? = nil,
        vbriSeekTable: VBRISeekTable? = nil
    ) {
        self.sourceID = sourceID
        self.sourceURL = sourceURL
        self.cacheKey = cacheKey
        self.fingerprint = fingerprint
        self.firstAudioFrameOffset = firstAudioFrameOffset
        self.dataStartOffset = dataStartOffset
        self.dataEndOffset = dataEndOffset
        self.seekHeaderKind = seekHeaderKind
        self.sampleRate = sampleRate
        self.channelCount = channelCount
        self.samplesPerFrame = samplesPerFrame
        self.firstFrameByteLength = firstFrameByteLength
        self.estimatedBitrate = estimatedBitrate
        self.durationUs = durationUs
        self.encoderDelayFrames = encoderDelayFrames
        self.encoderPaddingFrames = encoderPaddingFrames
        self.xingToc = xingToc
        self.vbriSeekTable = vbriSeekTable
    }
}
