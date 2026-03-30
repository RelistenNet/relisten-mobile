import Foundation

/// Coordinates metadata loading, source opening, decode pacing, and track handoff.
///
/// The coordinator intentionally sits above low-level IO/decode primitives and below
/// any queueing or bridge concerns. Its job is to make one current track and one next
/// track look like a single continuous PCM timeline.
actor GaplessPlaybackCoordinator {
    struct RuntimeStatus: Sendable {
        var isReadyToPlay: Bool
        var scheduledThroughTime: TimeInterval
        var currentSourceDownload: SourceDownloadStatus?
        var nextSourceDownload: SourceDownloadStatus?
        var errorDescription: String?
    }

    fileprivate struct PreparedTrack: Sendable {
        var source: GaplessPlaybackSource
        var metadata: MP3TrackMetadata
    }

    private struct PreparedPlayback: Sendable {
        var current: PreparedTrack
        var next: PreparedTrack?
        var report: GaplessPreparationReport
    }

    private struct ActivePlaybackContext {
        var currentSourceID: String
        var currentTrackDuration: TimeInterval
        var currentStartTime: TimeInterval
        var currentTrackTimelineOrigin: TimeInterval
        var plan: PlaybackSessionPlan
        var currentTimeProvider: @Sendable () async -> TimeInterval
    }

    private struct NextProducerTaskState {
        var currentSourceID: String
        var nextSourceID: String
        var task: Task<TrackPCMProducer, Error>
    }

    private struct PendingTrackTransition: Sendable {
        var preparedPlayback: PreparedPlayback
        var boundaryTime: TimeInterval
    }

    private let sourceManager: MP3SourceManager
    private let parser = MP3GaplessMetadataParser()
    private var preparedPlayback: PreparedPlayback?
    private var pendingTransitionPlayback: PendingTrackTransition?
    private var playbackTask: Task<Void, Never>?
    private var isReadyToPlay = false
    private var scheduledThroughTime: TimeInterval = 0
    private var playbackStartTime: TimeInterval = 0
    private var lastPlaybackErrorDescription: String?
    private var activePlaybackContext: ActivePlaybackContext?
    private var nextProducerTaskState: NextProducerTaskState?

    init(sourceManager: MP3SourceManager = MP3SourceManager()) {
        self.sourceManager = sourceManager
    }

    func setRuntimeEventHandler(_ handler: (@Sendable (GaplessRuntimeEvent) -> Void)?) async {
        await sourceManager.setRuntimeEventHandler(handler)
    }

    func setHTTPLogHandler(_ handler: (@Sendable (GaplessHTTPLogEvent) -> Void)?) async {
        await sourceManager.setHTTPLogHandler(handler)
    }

    /// Parses metadata for the current and optional next track and validates that both
    /// can share a single PCM output graph. We reject mismatched sample-rate/channel
    /// pairs here so the runtime never has to reconfigure the output node mid-transition.
    func prepare(
        current: GaplessPlaybackSource,
        next: GaplessPlaybackSource?,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil
    ) async throws -> GaplessPreparationReport {
        self.stopPlayback()

        eventHandler?(.phase("Loading current track metadata"))
        let currentTrack = try await loadTrackMetadata(current, eventHandler: eventHandler)
        let nextTrack: PreparedTrack?

        if let next {
            eventHandler?(.phase("Loading next track metadata"))
            nextTrack = try await loadTrackMetadata(next, eventHandler: eventHandler)
        } else {
            nextTrack = nil
        }

        guard nextTrack == nil
            || (currentTrack.metadata.sampleRate == nextTrack?.metadata.sampleRate
                && currentTrack.metadata.channelCount == nextTrack?.metadata.channelCount) else {
            throw GaplessMP3PlayerError.incompatibleTrackFormats
        }

        let report = makeReport(current: currentTrack, next: nextTrack)
        preparedPlayback = PreparedPlayback(current: currentTrack, next: nextTrack, report: report)
        isReadyToPlay = false
        scheduledThroughTime = 0
        playbackStartTime = 0
        lastPlaybackErrorDescription = nil
        eventHandler?(.prepared(report))
        return report
    }

    func setNext(_ source: GaplessPlaybackSource?) async throws -> GaplessPreparationReport {
        let nextTrack: PreparedTrack?
        if let source {
            nextTrack = try await loadTrackMetadata(source, eventHandler: nil)
        } else {
            nextTrack = nil
        }

        guard var preparedPlayback else {
            throw GaplessMP3PlayerError.sourceNotPrepared
        }

        if let nextTrack {
            guard preparedPlayback.current.metadata.sampleRate == nextTrack.metadata.sampleRate,
                  preparedPlayback.current.metadata.channelCount == nextTrack.metadata.channelCount else {
                throw GaplessMP3PlayerError.incompatibleTrackFormats
            }
        }

        preparedPlayback.next = nextTrack
        preparedPlayback.report = makeReport(current: preparedPlayback.current, next: nextTrack)
        self.preparedPlayback = preparedPlayback
        refreshNextProducerTaskIfNeeded()
        return preparedPlayback.report
    }

    /// Starts the streaming playback loop. Callers provide the scheduling/time hooks so
    /// this actor remains platform-neutral and testable without owning AVFoundation.
    func startPlayback(
        startTime: TimeInterval,
        playbackPolicy: GaplessPlaybackPolicy,
        scheduleChunk: @escaping @Sendable (PCMChunk) async throws -> Void,
        currentTimeProvider: @escaping @Sendable () async -> TimeInterval,
        becameReady: @escaping @Sendable () async -> Void,
        trackTransitionScheduled: @escaping @Sendable (GaplessPreparationReport, TimeInterval) async -> Void,
        playbackFinished: @escaping @Sendable () async -> Void,
        playbackFailed: @escaping @Sendable (Error) async -> Void
    ) throws {
        guard let preparedPlayback else {
            throw GaplessMP3PlayerError.sourceNotPrepared
        }

        stopPlayback()
        isReadyToPlay = false
        scheduledThroughTime = startTime
        playbackStartTime = startTime
        lastPlaybackErrorDescription = nil

        playbackTask = Task {
            do {
                try await self.runPlayback(
                    preparedPlayback: preparedPlayback,
                    startTime: startTime,
                    plan: PlaybackSessionPlan(policy: playbackPolicy),
                    scheduleChunk: scheduleChunk,
                    currentTimeProvider: currentTimeProvider,
                    becameReady: becameReady,
                    trackTransitionScheduled: trackTransitionScheduled,
                    playbackFinished: playbackFinished
                )
            } catch is CancellationError {
                return
            } catch {
                self.recordPlaybackFailure(error)
                await playbackFailed(error)
                return
            }
        }
    }

    /// Cancels any active playback task and clears runtime state. Source sessions keep
    /// their own lifecycle so metadata/cache work can still be reused afterwards.
    func stopPlayback() {
        playbackTask?.cancel()
        playbackTask = nil
        pendingTransitionPlayback = nil
        activePlaybackContext = nil
        cancelNextProducerTask()
        isReadyToPlay = false
        scheduledThroughTime = 0
        playbackStartTime = 0
    }

    /// Returns high-level runtime state for the CLI and app bridge. The status focuses
    /// on actionable playback information rather than exposing every internal actor field.
    func status(
        current: GaplessPlaybackSource?,
        next: GaplessPlaybackSource?,
        currentTime: TimeInterval
    ) async -> RuntimeStatus {
        async let currentStatus = sourceManager.downloadStatus(for: current)
        async let nextStatus = sourceManager.downloadStatus(for: next)

        return await RuntimeStatus(
            isReadyToPlay: isReadyToPlay,
            scheduledThroughTime: max(scheduledThroughTime - currentTime, 0),
            currentSourceDownload: currentStatus,
            nextSourceDownload: nextStatus,
            errorDescription: lastPlaybackErrorDescription
        )
    }

    private func recordPlaybackFailure(_ error: Error) {
        lastPlaybackErrorDescription = String(describing: error)
        isReadyToPlay = false
        scheduledThroughTime = 0
    }

    /// Metadata is loaded through the source manager so HTTP/local/cache all share the
    /// same prefix-reading behavior.
    private func loadTrackMetadata(
        _ source: GaplessPlaybackSource,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)?
    ) async throws -> PreparedTrack {
        let (metadataData, fingerprint) = try await sourceManager.metadataData(for: source, eventHandler: eventHandler)
        let metadata = try parser.parse(source: source, data: metadataData, fingerprint: fingerprint)
        return PreparedTrack(source: source, metadata: metadata)
    }

    /// Builds producers for the current and next tracks, then drains them in sequence
    /// onto the same output timeline. The startup-buffer threshold intentionally trades
    /// a small amount of latency for fewer initial underruns.
    private func runPlayback(
        preparedPlayback: PreparedPlayback,
        startTime: TimeInterval,
        plan: PlaybackSessionPlan,
        scheduleChunk: @escaping @Sendable (PCMChunk) async throws -> Void,
        currentTimeProvider: @escaping @Sendable () async -> TimeInterval,
        becameReady: @escaping @Sendable () async -> Void,
        trackTransitionScheduled: @escaping @Sendable (GaplessPreparationReport, TimeInterval) async -> Void,
        playbackFinished: @escaping @Sendable () async -> Void
    ) async throws {
        let startupBufferTarget = max(plan.currentStartupBufferDuration, 0.15)
        let maxBufferedAhead = max(startupBufferTarget * 3, 3)
        var currentPlayback = preparedPlayback
        var currentStartTime = startTime
        var currentTrackTimelineOrigin = 0.0
        var currentProducer = try await TrackPCMProducer.make(
            track: currentPlayback.current,
            sourceManager: sourceManager,
            startTime: currentStartTime,
            allowsParallelRangeRequests: plan.allowsParallelSeekRangeRequests,
            finalizationModeProvider: makeFinalizationModeProvider(for: currentPlayback.current.source.id)
        )

        while true {
            installActivePlaybackContext(
                playback: currentPlayback,
                currentStartTime: currentStartTime,
                currentTrackTimelineOrigin: currentTrackTimelineOrigin,
                plan: plan,
                currentTimeProvider: currentTimeProvider
            )

            try await drainProducer(
                currentProducer,
                startupBufferTarget: startupBufferTarget,
                maxBufferedAhead: maxBufferedAhead,
                scheduleChunk: scheduleChunk,
                currentTimeProvider: currentTimeProvider,
                becameReady: becameReady
            )

            let nextProducer = try await resolveNextProducer(for: currentPlayback.current.source.id)
            guard let nextProducer else { break }

            let transitionBoundaryTime = currentTrackTimelineOrigin + currentPlayback.report.current.trimmedDuration
            if let pendingTransition = schedulePendingTransition(
                from: currentPlayback,
                boundaryTime: transitionBoundaryTime
            ) {
                await trackTransitionScheduled(
                    pendingTransition.preparedPlayback.report,
                    pendingTransition.boundaryTime
                )
                currentPlayback = pendingTransition.preparedPlayback
            } else {
                break
            }

            currentProducer = nextProducer
            currentStartTime = 0
            currentTrackTimelineOrigin = transitionBoundaryTime
        }

        activePlaybackContext = nil
        cancelNextProducerTask()

        if !isReadyToPlay {
            isReadyToPlay = true
            await becameReady()
        }

        await playbackFinished()
    }

    func promotePendingTransition() {
        guard let pendingTransitionPlayback else { return }
        preparedPlayback = pendingTransitionPlayback.preparedPlayback
        self.pendingTransitionPlayback = nil
        refreshNextProducerTaskIfNeeded()
    }

    private func installActivePlaybackContext(
        playback: PreparedPlayback,
        currentStartTime: TimeInterval,
        currentTrackTimelineOrigin: TimeInterval,
        plan: PlaybackSessionPlan,
        currentTimeProvider: @escaping @Sendable () async -> TimeInterval
    ) {
        activePlaybackContext = ActivePlaybackContext(
            currentSourceID: playback.current.source.id,
            currentTrackDuration: playback.report.current.trimmedDuration,
            currentStartTime: currentStartTime,
            currentTrackTimelineOrigin: currentTrackTimelineOrigin,
            plan: plan,
            currentTimeProvider: currentTimeProvider
        )
        refreshNextProducerTaskIfNeeded()
    }

    private func refreshNextProducerTaskIfNeeded() {
        guard let activePlaybackContext,
              let playback = playbackSnapshot(for: activePlaybackContext.currentSourceID),
              let nextTrack = playback.next else {
            cancelNextProducerTask()
            return
        }

        guard activePlaybackContext.plan.allowsParallelCurrentAndNextDownloads else {
            cancelNextProducerTask()
            return
        }

        if let nextProducerTaskState,
           nextProducerTaskState.currentSourceID == activePlaybackContext.currentSourceID,
           nextProducerTaskState.nextSourceID == nextTrack.source.id {
            return
        }

        cancelNextProducerTask()
        nextProducerTaskState = NextProducerTaskState(
            currentSourceID: activePlaybackContext.currentSourceID,
            nextSourceID: nextTrack.source.id,
            task: makeNextProducerTask(
                nextTrack: nextTrack,
                currentTrackDuration: activePlaybackContext.currentTrackDuration,
                currentStartTime: activePlaybackContext.currentStartTime,
                currentTrackTimelineOrigin: activePlaybackContext.currentTrackTimelineOrigin,
                plan: activePlaybackContext.plan,
                currentTimeProvider: activePlaybackContext.currentTimeProvider
            )
        )
    }

    private func cancelNextProducerTask() {
        nextProducerTaskState?.task.cancel()
        nextProducerTaskState = nil
    }

    private func makeNextProducerTask(
        nextTrack: PreparedTrack,
        currentTrackDuration: TimeInterval,
        currentStartTime: TimeInterval,
        currentTrackTimelineOrigin: TimeInterval,
        plan: PlaybackSessionPlan,
        currentTimeProvider: @escaping @Sendable () async -> TimeInterval
    ) -> Task<TrackPCMProducer, Error> {
        let sourceManager = self.sourceManager
        let preloadImmediately = currentStartTime >= max(currentTrackDuration - plan.nextTrackPreloadLeadTime, 0)
        return Task {
            if preloadImmediately {
                try await sourceManager.preload(nextTrack.source)
                let producer = try await TrackPCMProducer.make(
                    track: nextTrack,
                    sourceManager: sourceManager,
                    startTime: 0,
                    allowsParallelRangeRequests: plan.allowsParallelSeekRangeRequests,
                    finalizationModeProvider: self.makeFinalizationModeProvider(for: nextTrack.source.id)
                )
                try await producer.prefetch(minimumDuration: plan.nextTrackWarmupDuration)
                return producer
            }

            while true {
                try Task.checkCancellation()
                let currentTrackTime = max((await currentTimeProvider()) - currentTrackTimelineOrigin, 0)
                if plan.shouldBeginNextTrackPreload(currentTime: currentTrackTime, transitionTime: currentTrackDuration) {
                    try await sourceManager.preload(nextTrack.source)
                    let producer = try await TrackPCMProducer.make(
                        track: nextTrack,
                        sourceManager: sourceManager,
                        startTime: 0,
                        allowsParallelRangeRequests: plan.allowsParallelSeekRangeRequests,
                        finalizationModeProvider: self.makeFinalizationModeProvider(for: nextTrack.source.id)
                    )
                    try await producer.prefetch(minimumDuration: plan.nextTrackWarmupDuration)
                    return producer
                }
                try await Task.sleep(for: .milliseconds(50))
            }
        }
    }

    private func resolveNextProducer(for currentSourceID: String) async throws -> TrackPCMProducer? {
        while true {
            try Task.checkCancellation()
            refreshNextProducerTaskIfNeeded()

            guard let nextProducerTaskState,
                  nextProducerTaskState.currentSourceID == currentSourceID else {
                guard let activePlaybackContext,
                      activePlaybackContext.currentSourceID == currentSourceID,
                      let playback = playbackSnapshot(for: currentSourceID),
                      let nextTrack = playback.next else {
                    return nil
                }
                return try await makeImmediateNextProducer(nextTrack: nextTrack, plan: activePlaybackContext.plan)
            }

            do {
                let producer = try await nextProducerTaskState.task.value
                if let playback = playbackSnapshot(for: currentSourceID),
                   let nextTrack = playback.next,
                   nextTrack.source.id == nextProducerTaskState.nextSourceID {
                    if self.nextProducerTaskState?.currentSourceID == nextProducerTaskState.currentSourceID,
                       self.nextProducerTaskState?.nextSourceID == nextProducerTaskState.nextSourceID {
                        self.nextProducerTaskState = nil
                    }
                    return producer
                }
            } catch is CancellationError {
                if Task.isCancelled {
                    throw CancellationError()
                }
            }
        }
    }

    private func makeImmediateNextProducer(
        nextTrack: PreparedTrack,
        plan: PlaybackSessionPlan
    ) async throws -> TrackPCMProducer {
        let producer = try await TrackPCMProducer.make(
            track: nextTrack,
            sourceManager: sourceManager,
            startTime: 0,
            allowsParallelRangeRequests: plan.allowsParallelSeekRangeRequests,
            finalizationModeProvider: makeFinalizationModeProvider(for: nextTrack.source.id)
        )
        try await producer.prefetch(minimumDuration: plan.nextTrackWarmupDuration)
        return producer
    }

    private func drainProducer(
        _ producer: TrackPCMProducer,
        startupBufferTarget: TimeInterval,
        maxBufferedAhead: TimeInterval,
        scheduleChunk: @escaping @Sendable (PCMChunk) async throws -> Void,
        currentTimeProvider: @escaping @Sendable () async -> TimeInterval,
        becameReady: @escaping @Sendable () async -> Void
    ) async throws {
        while let chunk = try await producer.nextChunk() {
            try Task.checkCancellation()

            // Backpressure is based on scheduled-ahead time instead of raw bytes because
            // audible underruns are what matter at this layer.
            while (scheduledThroughTime - (await currentTimeProvider())) > maxBufferedAhead {
                try Task.checkCancellation()
                try await Task.sleep(for: .milliseconds(50))
            }

            try await scheduleChunk(chunk)
            scheduledThroughTime += producer.duration(for: chunk)

            if !isReadyToPlay && (scheduledThroughTime - playbackStartTime) >= startupBufferTarget {
                isReadyToPlay = true
                await becameReady()
            }
        }
    }

    private func trimmedDuration(for metadata: MP3TrackMetadata) -> TimeInterval {
        guard let durationUs = metadata.durationUs else { return 0 }
        let totalFrames = max(Int64(durationUs) * Int64(metadata.sampleRate) / 1_000_000, 0)
        let trimmedFrames = max(
            totalFrames - Int64(metadata.encoderDelayFrames) - Int64(metadata.encoderPaddingFrames),
            0
        )
        return Double(trimmedFrames) / Double(metadata.sampleRate)
    }

    private func playbackSnapshot(for currentSourceID: String) -> PreparedPlayback? {
        if let preparedPlayback, preparedPlayback.current.source.id == currentSourceID {
            return preparedPlayback
        }
        if let pendingTransitionPlayback,
           pendingTransitionPlayback.preparedPlayback.current.source.id == currentSourceID {
            return pendingTransitionPlayback.preparedPlayback
        }
        return nil
    }

    private func makeFinalizationModeProvider(
        for sourceID: String
    ) -> @Sendable () async -> TrackPCMProducer.FinalizationMode {
        { [weak self] in
            guard let self else { return .finalTrack }
            return await self.finalizationMode(for: sourceID)
        }
    }

    private func finalizationMode(for sourceID: String) -> TrackPCMProducer.FinalizationMode {
        guard let playback = playbackSnapshot(for: sourceID) else {
            return .finalTrack
        }
        return playback.next == nil ? .finalTrack : .transition
    }

    private func schedulePendingTransition(from preparedPlayback: PreparedPlayback, boundaryTime: TimeInterval) -> PendingTrackTransition? {
        guard let nextTrack = preparedPlayback.next else { return nil }
        let transitionedPlayback = PreparedPlayback(
            current: nextTrack,
            next: nil,
            report: makeReport(current: nextTrack, next: nil)
        )
        let pendingTransition = PendingTrackTransition(
            preparedPlayback: transitionedPlayback,
            boundaryTime: boundaryTime
        )
        pendingTransitionPlayback = pendingTransition
        return pendingTransition
    }

    private func makeReport(current: PreparedTrack, next: PreparedTrack?) -> GaplessPreparationReport {
        return GaplessPreparationReport(
            current: .init(
                source: current.source,
                metadata: current.metadata,
                trimmedDuration: trimmedDuration(for: current.metadata)
            ),
            next: next.map {
                .init(
                    source: $0.source,
                    metadata: $0.metadata,
                    trimmedDuration: trimmedDuration(for: $0.metadata)
                )
            },
            sampleRate: Double(current.metadata.sampleRate),
            transitionIsContinuous: next != nil
        )
    }
}

/// Produces trimmed PCM for one track from a source session + decoder.
///
/// This stays nested in the coordinator file because its invariants are tightly coupled
/// to the coordinator's "one track at a time, one transition boundary" model.
private final class TrackPCMProducer: @unchecked Sendable {
    enum FinalizationMode {
        case transition
        case finalTrack
    }

    private let track: GaplessPlaybackCoordinator.PreparedTrack
    private let readSession: SourceReadSession
    private let decoder: MP3FrameDecoder
    private let trimEngine: GaplessTrimEngine
    private let finalizationModeProvider: @Sendable () async -> FinalizationMode

    private var prefetchedChunks: [PCMChunk] = []
    private var hasFedData = false
    private var reachedEndOfStream = false
    private var hasFinalized = false

    private init(
        track: GaplessPlaybackCoordinator.PreparedTrack,
        sourceManager: MP3SourceManager,
        startTime: TimeInterval,
        allowsParallelRangeRequests: Bool,
        finalizationModeProvider: @escaping @Sendable () async -> FinalizationMode
    ) async throws {
        self.track = track
        let seekPlan = TrackSeekPlanner.plan(metadata: track.metadata, startTime: startTime)
        // Seeking uses metadata-derived byte offsets when possible, but the decoder still
        // starts from whole MP3 frames. Any residual sample inaccuracy is corrected by
        // `GaplessTrimEngine`.
        self.readSession = try await sourceManager.makeReadSession(
            for: track.source,
            startingOffset: seekPlan.byteOffset,
            contentLength: track.metadata.fingerprint.contentLength,
            allowsParallelRangeRequests: allowsParallelRangeRequests
        )
        self.decoder = try MP3FrameDecoder(metadata: track.metadata)
        self.trimEngine = GaplessTrimEngine(
            channelCount: track.metadata.channelCount,
            sampleRate: Double(track.metadata.sampleRate),
            startFrames: seekPlan.trimStartFrames,
            endFrames: track.metadata.encoderPaddingFrames
        )
        self.finalizationModeProvider = finalizationModeProvider
    }

    /// Pulls decoded PCM until either a trimmed chunk is ready or the track is finalized.
    func nextChunk() async throws -> PCMChunk? {
        if hasFinalized {
            return nil
        }

        if !prefetchedChunks.isEmpty {
            return prefetchedChunks.removeFirst()
        }

        while true {
            switch try decoder.readChunk() {
            case .chunk(let chunk):
                if let output = trimEngine.process(chunk), !output.isEmpty {
                    return output
                }
            case .needMoreData:
                if reachedEndOfStream {
                    hasFinalized = true
                    return await finalize()
                }

                switch try await readSession.read(maxLength: 32 * 1024) {
                case .available(let data):
                    try decoder.feed(data, isDiscontinuous: !hasFedData)
                    hasFedData = true
                case .awaitMoreData:
                    continue
                case .endOfStream:
                    reachedEndOfStream = true
                    decoder.markEndOfStream()
                }
            case .endOfStream:
                hasFinalized = true
                return await finalize()
            }
        }
    }

    func duration(for chunk: PCMChunk) -> TimeInterval {
        Double(chunk.frameCount) / chunk.sampleRate
    }

    func prefetch(minimumDuration: TimeInterval) async throws {
        guard minimumDuration > 0 else { return }

        var bufferedDuration = prefetchedChunks.reduce(0) { $0 + duration(for: $1) }
        while bufferedDuration < minimumDuration {
            guard let chunk = try await nextChunk() else { return }
            prefetchedChunks.append(chunk)
            bufferedDuration += duration(for: chunk)
        }
    }

    static func make(
        track: GaplessPlaybackCoordinator.PreparedTrack,
        sourceManager: MP3SourceManager,
        startTime: TimeInterval,
        allowsParallelRangeRequests: Bool,
        finalizationModeProvider: @escaping @Sendable () async -> FinalizationMode
    ) async throws -> TrackPCMProducer {
        try await TrackPCMProducer(
            track: track,
            sourceManager: sourceManager,
            startTime: startTime,
            allowsParallelRangeRequests: allowsParallelRangeRequests,
            finalizationModeProvider: finalizationModeProvider
        )
    }

    /// Transition boundaries drop the retained tail; final tracks drop encoder padding.
    private func finalize() async -> PCMChunk? {
        switch await finalizationModeProvider() {
        case .transition:
            trimEngine.finishForTransition()
            return nil
        case .finalTrack:
            return trimEngine.finishFinalTrack(dropFinalPadding: true)
        }
    }
}
