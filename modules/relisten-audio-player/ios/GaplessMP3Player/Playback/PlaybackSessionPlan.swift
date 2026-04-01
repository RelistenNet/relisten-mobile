import Foundation

/// Internal playback plan derived from the public policy.
///
/// The coordinator uses this to keep policy interpretation in one place instead of
/// scattering threshold math across startup, handoff, and seek paths.
struct PlaybackSessionPlan: Sendable {
    var currentStartupBufferDuration: TimeInterval
    var nextTrackWarmupDuration: TimeInterval
    var nextTrackPreloadLeadTime: TimeInterval
    var allowsParallelCurrentAndNextDownloads: Bool
    var allowsParallelSeekRangeRequests: Bool
    var seekRangeRequestSizeBytes: Int64
    var seekRangePrefetchLowWatermarkBytes: Int64

    init(policy: GaplessPlaybackPolicy) {
        self.currentStartupBufferDuration = max(policy.currentTrack.minimumBufferedDuration, 0)
        self.nextTrackWarmupDuration = max(policy.nextTrack.minimumBufferedDuration, 0)
        self.nextTrackPreloadLeadTime = max(policy.nextTrackPreloadLeadTime, 0)
        self.allowsParallelCurrentAndNextDownloads = policy.allowsParallelCurrentAndNextDownloads
        self.allowsParallelSeekRangeRequests = policy.allowsParallelSeekRangeRequests
        self.seekRangeRequestSizeBytes = max(policy.seekRangeRequestSizeBytes, 1)
        self.seekRangePrefetchLowWatermarkBytes = max(
            min(policy.seekRangePrefetchLowWatermarkBytes, self.seekRangeRequestSizeBytes),
            1
        )
    }

    func shouldBeginNextTrackPreload(currentTime: TimeInterval, transitionTime: TimeInterval) -> Bool {
        currentTime >= max(transitionTime - nextTrackPreloadLeadTime, 0)
    }
}
