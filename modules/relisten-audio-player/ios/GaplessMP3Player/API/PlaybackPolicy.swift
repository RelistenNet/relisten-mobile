import Foundation

/// Buffer requirement for one side of the playback handoff.
///
/// `currentTrack` governs startup readiness for the active track, while `nextTrack`
/// governs how much trimmed PCM the coordinator tries to warm before the transition.
public struct GaplessTrackBufferPolicy: Codable, Equatable, Sendable {
    public var minimumBufferedDuration: TimeInterval

    public init(minimumBufferedDuration: TimeInterval) {
        self.minimumBufferedDuration = minimumBufferedDuration
    }
}

/// Runtime policy knobs that are backed by concrete coordinator/source-manager behavior.
public struct GaplessPlaybackPolicy: Codable, Equatable, Sendable {
    public var currentTrack: GaplessTrackBufferPolicy
    public var nextTrack: GaplessTrackBufferPolicy
    public var nextTrackPreloadLeadTime: TimeInterval
    public var allowsParallelCurrentAndNextDownloads: Bool
    public var allowsParallelSeekRangeRequests: Bool
    public var seekRangeRequestSizeBytes: Int64
    public var seekRangePrefetchLowWatermarkBytes: Int64

    public init(
        currentTrack: GaplessTrackBufferPolicy = .init(minimumBufferedDuration: 1),
        nextTrack: GaplessTrackBufferPolicy = .init(minimumBufferedDuration: 2),
        nextTrackPreloadLeadTime: TimeInterval = 10,
        allowsParallelCurrentAndNextDownloads: Bool = true,
        allowsParallelSeekRangeRequests: Bool = true,
        seekRangeRequestSizeBytes: Int64 = 1_024 * 1_024,
        seekRangePrefetchLowWatermarkBytes: Int64 = 512 * 1_024
    ) {
        self.currentTrack = currentTrack
        self.nextTrack = nextTrack
        self.nextTrackPreloadLeadTime = nextTrackPreloadLeadTime
        self.allowsParallelCurrentAndNextDownloads = allowsParallelCurrentAndNextDownloads
        self.allowsParallelSeekRangeRequests = allowsParallelSeekRangeRequests
        self.seekRangeRequestSizeBytes = max(seekRangeRequestSizeBytes, 1)
        self.seekRangePrefetchLowWatermarkBytes = max(
            min(seekRangePrefetchLowWatermarkBytes, self.seekRangeRequestSizeBytes),
            1
        )
    }
}
