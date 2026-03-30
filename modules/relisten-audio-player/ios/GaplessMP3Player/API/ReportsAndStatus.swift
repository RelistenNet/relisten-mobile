import Foundation

/// Result of preparing the current track and optional next track for playback.
public struct GaplessPreparationReport: Sendable {
    /// Preparation output for a single track after metadata load and trim calculation.
    public struct TrackReport: Sendable {
        public var source: GaplessPlaybackSource
        public var metadata: MP3TrackMetadata
        public var trimmedDuration: TimeInterval

        public init(source: GaplessPlaybackSource, metadata: MP3TrackMetadata, trimmedDuration: TimeInterval) {
            self.source = source
            self.metadata = metadata
            self.trimmedDuration = trimmedDuration
        }
    }

    public var current: TrackReport
    public var next: TrackReport?
    public var sampleRate: Double
    public var transitionIsContinuous: Bool

    public init(
        current: TrackReport,
        next: TrackReport?,
        sampleRate: Double,
        transitionIsContinuous: Bool
    ) {
        self.current = current
        self.next = next
        self.sampleRate = sampleRate
        self.transitionIsContinuous = transitionIsContinuous
    }
}

/// High-level download state projected from local/progressive/range source activity.
public enum SourceDownloadState: String, Sendable {
    case idle
    case localFile
    case downloading
    case retrying
    case cached
    case completed
    case failed
}

/// Explicit playback phase so callers do not infer stopped/paused/playing from boolean combinations.
public enum GaplessPlaybackPhase: String, Sendable {
    case stopped
    case preparing
    case paused
    case playing
    case failed
}

/// User-facing snapshot of download progress for one source.
public struct SourceDownloadStatus: Sendable {
    public var source: GaplessPlaybackSource
    public var state: SourceDownloadState
    public var downloadedBytes: Int64
    public var expectedBytes: Int64?
    public var resolvedFileURL: URL?
    public var errorDescription: String?
    public var retryAttempt: Int?
    public var maxRetryAttempts: Int?
    public var retryDelay: TimeInterval?

    public init(
        source: GaplessPlaybackSource,
        state: SourceDownloadState,
        downloadedBytes: Int64,
        expectedBytes: Int64?,
        resolvedFileURL: URL? = nil,
        errorDescription: String? = nil,
        retryAttempt: Int? = nil,
        maxRetryAttempts: Int? = nil,
        retryDelay: TimeInterval? = nil
    ) {
        self.source = source
        self.state = state
        self.downloadedBytes = downloadedBytes
        self.expectedBytes = expectedBytes
        self.resolvedFileURL = resolvedFileURL
        self.errorDescription = errorDescription
        self.retryAttempt = retryAttempt
        self.maxRetryAttempts = maxRetryAttempts
        self.retryDelay = retryDelay
    }

    public var fractionCompleted: Double? {
        guard let expectedBytes, expectedBytes > 0 else { return nil }
        return min(max(Double(downloadedBytes) / Double(expectedBytes), 0), 1)
    }
}

/// Combined playback/runtime status for the current output graph.
public struct GaplessMP3PlayerStatus: Sendable {
    public var currentTime: TimeInterval
    public var duration: TimeInterval?
    public var playbackPhase: GaplessPlaybackPhase
    public var isPlaying: Bool
    public var isReadyToPlay: Bool
    public var bufferedDuration: TimeInterval
    public var transitionTime: TimeInterval?
    public var currentSource: GaplessPlaybackSource?
    public var nextSource: GaplessPlaybackSource?
    public var currentSourceDownload: SourceDownloadStatus?
    public var nextSourceDownload: SourceDownloadStatus?
    public var errorDescription: String?

    public init(
        currentTime: TimeInterval,
        duration: TimeInterval?,
        playbackPhase: GaplessPlaybackPhase,
        isPlaying: Bool,
        isReadyToPlay: Bool,
        bufferedDuration: TimeInterval,
        transitionTime: TimeInterval?,
        currentSource: GaplessPlaybackSource?,
        nextSource: GaplessPlaybackSource?,
        currentSourceDownload: SourceDownloadStatus?,
        nextSourceDownload: SourceDownloadStatus?,
        errorDescription: String? = nil
    ) {
        self.currentTime = currentTime
        self.duration = duration
        self.playbackPhase = playbackPhase
        self.isPlaying = isPlaying
        self.isReadyToPlay = isReadyToPlay
        self.bufferedDuration = bufferedDuration
        self.transitionTime = transitionTime
        self.currentSource = currentSource
        self.nextSource = nextSource
        self.currentSourceDownload = currentSourceDownload
        self.nextSourceDownload = nextSourceDownload
        self.errorDescription = errorDescription
    }
}
