import Dispatch
import Foundation

protocol PCMOutputControlling: AnyObject, Sendable {
    var isPlaying: Bool { get }
    var volume: Float { get set }
    func reset(timelineOffset: TimeInterval)
    func requestPlay()
    func schedule(_ chunk: PCMChunk) throws
    func pause()
    func markDecodeFinished()
    func currentTime() -> TimeInterval
}

private final class LockedValue<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value

    init(_ value: Value) {
        self.value = value
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func withValue<T>(_ body: (inout Value) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

public final class GaplessMP3Player: @unchecked Sendable {
    private struct PendingTrackTransition: Sendable {
        var report: GaplessPreparationReport
        var boundaryTime: TimeInterval
    }

    private struct PlaybackState {
        var outputGraph: PCMOutputControlling?
        var currentSource: GaplessPlaybackSource?
        var nextSource: GaplessPlaybackSource?
        var playbackPhase: GaplessPlaybackPhase = .stopped
        var requestedStartTime: TimeInterval = 0
        var publicTimelineOffset: TimeInterval = 0
        var pendingTrackTransition: PendingTrackTransition?
        var coordinatorTransitionPromotionNeeded = false
        var latestPreparationReport: GaplessPreparationReport?
        var lastPlaybackErrorDescription: String?
        var suppressPlaybackFinishedEvent = false
        var volume: Float = 1.0
    }

    private struct PlaybackSnapshot: Sendable {
        var currentTime: TimeInterval = 0
        var sampledAtUptime: TimeInterval = ProcessInfo.processInfo.systemUptime
        var duration: TimeInterval?
        var isPlaying = false
        var playbackPhase: GaplessPlaybackPhase = .stopped
        var latestPreparationReport: GaplessPreparationReport?
        var currentSource: GaplessPlaybackSource?
        var nextSource: GaplessPlaybackSource?
        var publicTimelineOffset: TimeInterval = 0
        var pendingTrackTransition: PendingTrackTransition?
        var requestedStartTime: TimeInterval = 0
        var errorDescription: String?
    }

    private struct PresentedSnapshot {
        var currentTime: TimeInterval
        var duration: TimeInterval?
        var isPlaying: Bool
        var playbackPhase: GaplessPlaybackPhase
        var latestPreparationReport: GaplessPreparationReport?
        var currentSource: GaplessPlaybackSource?
        var nextSource: GaplessPlaybackSource?
        var errorDescription: String?
    }

    private struct CallbackConfiguration {
        var runtimeEventHandler: (@Sendable (GaplessRuntimeEvent) -> Void)?
        var httpLogHandler: (@Sendable (GaplessHTTPLogEvent) -> Void)?
        var callbackQueue: DispatchQueue?
    }

    private enum PlaybackFinishedOutcome: Sendable {
        case suppressed
        case transitioned
        case finished(GaplessPlaybackSource?)
    }

    private let playbackPolicy: GaplessPlaybackPolicy
    private let coordinator: GaplessPlaybackCoordinator
    private let outputGraphFactory: (Double, Int) throws -> PCMOutputControlling
    private let playbackQueue: DispatchQueue
    private let playbackQueueSpecificKey = DispatchSpecificKey<Void>()
    private let stateStore = LockedValue(PlaybackState())
    private let snapshotStore = LockedValue(PlaybackSnapshot())
    private let callbackConfiguration = LockedValue(CallbackConfiguration())

    public init(
        playbackPolicy: GaplessPlaybackPolicy = .init(),
        cacheDirectory: URL? = nil,
        cacheMode: GaplessCacheMode = .enabled,
        retryPolicy: GaplessHTTPRetryPolicy = .init()
    ) {
        let playbackQueue = DispatchQueue(label: "GaplessMP3Player.playback", qos: .userInitiated)
        self.playbackPolicy = playbackPolicy
        self.coordinator = GaplessPlaybackCoordinator(
            sourceManager: MP3SourceManager(
                cacheDirectory: cacheDirectory ?? FileManager.default.temporaryDirectory.appendingPathComponent("GaplessMP3PlayerCache", isDirectory: true),
                cacheMode: cacheMode,
                retryPolicy: retryPolicy
            )
        )
        self.playbackQueue = playbackQueue
        self.outputGraphFactory = { [playbackQueue] sampleRate, channelCount in
            try PCMOutputGraph(sampleRate: sampleRate, channelCount: channelCount, ownerQueue: playbackQueue)
        }
        playbackQueue.setSpecific(key: playbackQueueSpecificKey, value: ())
    }

    init(
        playbackPolicy: GaplessPlaybackPolicy = .init(),
        sourceManager: MP3SourceManager,
        outputGraphFactory: ((Double, Int) throws -> PCMOutputControlling)? = nil
    ) {
        let playbackQueue = DispatchQueue(label: "GaplessMP3Player.playback", qos: .userInitiated)
        self.playbackPolicy = playbackPolicy
        self.coordinator = GaplessPlaybackCoordinator(sourceManager: sourceManager)
        self.playbackQueue = playbackQueue
        self.outputGraphFactory = outputGraphFactory ?? { [playbackQueue] sampleRate, channelCount in
            try PCMOutputGraph(sampleRate: sampleRate, channelCount: channelCount, ownerQueue: playbackQueue)
        }
        playbackQueue.setSpecific(key: playbackQueueSpecificKey, value: ())
    }

    public var callbackQueue: DispatchQueue? {
        get { callbackConfiguration.get().callbackQueue }
        set { callbackConfiguration.withValue { $0.callbackQueue = newValue } }
    }

    public var runtimeEventHandler: (@Sendable (GaplessRuntimeEvent) -> Void)? {
        get { callbackConfiguration.get().runtimeEventHandler }
        set { callbackConfiguration.withValue { $0.runtimeEventHandler = newValue } }
    }

    public var httpLogHandler: (@Sendable (GaplessHTTPLogEvent) -> Void)? {
        get { callbackConfiguration.get().httpLogHandler }
        set { callbackConfiguration.withValue { $0.httpLogHandler = newValue } }
    }

    public func prepare(current: GaplessPlaybackSource, next: GaplessPlaybackSource?) async throws {
        try await prepare(current: current, next: next, eventHandler: nil)
    }

    public func prepare(
        current: GaplessPlaybackSource,
        next: GaplessPlaybackSource?,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)?
    ) async throws {
        await performOnPlaybackQueue {
            self.stopOutputGraphOnPlaybackQueue()
            self.stateStore.withValue { state in
                state.currentSource = current
                state.nextSource = next
                state.playbackPhase = .preparing
                state.requestedStartTime = 0
                state.publicTimelineOffset = 0
                state.pendingTrackTransition = nil
                state.coordinatorTransitionPromotionNeeded = false
                state.latestPreparationReport = nil
                state.lastPlaybackErrorDescription = nil
                state.suppressPlaybackFinishedEvent = false
            }
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: 0)
        }

        do {
            await coordinator.setRuntimeEventHandler(makeRuntimeEventBridge())
            await coordinator.setHTTPLogHandler(makeHTTPLogBridge())
            let report = try await coordinator.prepare(current: current, next: next, eventHandler: eventHandler)
            let outputGraph = try await performOnPlaybackQueue {
                try self.outputGraphFactory(report.sampleRate, report.outputChannelCount)
            }

            await performOnPlaybackQueue {
                self.stopOutputGraphOnPlaybackQueue()
                outputGraph.volume = self.stateStore.get().volume
                self.stateStore.withValue { state in
                    state.outputGraph = outputGraph
                    state.currentSource = report.current.source
                    state.nextSource = report.next?.source
                    state.playbackPhase = .paused
                    state.requestedStartTime = 0
                    state.publicTimelineOffset = 0
                    state.pendingTrackTransition = nil
                    state.coordinatorTransitionPromotionNeeded = false
                    state.latestPreparationReport = report
                    state.lastPlaybackErrorDescription = nil
                }
                self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: 0)
            }
        } catch {
            await performOnPlaybackQueue {
                self.stateStore.withValue { state in
                    state.playbackPhase = .failed
                    state.lastPlaybackErrorDescription = String(describing: error)
                }
                self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: 0)
            }
            throw error
        }
    }

    @discardableResult
    public func play() -> Bool {
        guard latestPreparationReport != nil else { return false }

        playbackQueue.async { [weak self] in
            guard let self else { return }
            self.playOnPlaybackQueue()
        }
        return true
    }

    public func pause() {
        playbackQueue.async { [weak self] in
            guard let self else { return }
            self.pauseOnPlaybackQueue()
        }
    }

    public func stop() async {
        await performOnPlaybackQueue {
            self.stopOutputGraphOnPlaybackQueue()
            self.stateStore.withValue { state in
                state.currentSource = nil
                state.nextSource = nil
                state.playbackPhase = .stopped
                state.requestedStartTime = 0
                state.publicTimelineOffset = 0
                state.pendingTrackTransition = nil
                state.coordinatorTransitionPromotionNeeded = false
                state.latestPreparationReport = nil
                state.lastPlaybackErrorDescription = nil
                state.suppressPlaybackFinishedEvent = true
            }
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: 0)
        }

        await coordinator.stopPlayback()
    }

    public func seek(to time: TimeInterval) async throws {
        let shouldResumePlayback = try await performOnPlaybackQueue {
            let absoluteTimelineTime = self.absoluteTimelineTimeOnPlaybackQueue()
            _ = self.applyPendingTrackTransitionIfNeededOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)

            guard let duration = self.stateStore.get().latestPreparationReport?.current.trimmedDuration else {
                throw GaplessMP3PlayerError.sourceNotPrepared
            }

            let clampedTime = max(0, min(time, duration))
            let shouldResumePlayback = self.stateStore.get().outputGraph?.isPlaying ?? false
            self.stateStore.withValue { state in
                state.requestedStartTime = clampedTime
                state.publicTimelineOffset = 0
                state.pendingTrackTransition = nil
                state.outputGraph?.reset(timelineOffset: clampedTime)
            }
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: clampedTime)
            return shouldResumePlayback
        }

        await promoteCoordinatorTransitionIfNeeded()
        await coordinator.stopPlayback()

        if shouldResumePlayback {
            _ = play()
        }
    }

    public func setNext(_ source: GaplessPlaybackSource?) async throws {
        await performOnPlaybackQueue {
            let absoluteTimelineTime = self.absoluteTimelineTimeOnPlaybackQueue()
            _ = self.applyPendingTrackTransitionIfNeededOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
        }

        await promoteCoordinatorTransitionIfNeeded()
        let report = try await coordinator.setNext(source)
        await performOnPlaybackQueue {
            self.stateStore.withValue { state in
                state.currentSource = report.current.source
                state.nextSource = report.next?.source
                state.latestPreparationReport = report
                state.lastPlaybackErrorDescription = nil
            }
            self.refreshSnapshotOnPlaybackQueue()
        }
    }

    public var currentTime: TimeInterval {
        presentedSnapshot().currentTime
    }

    public var duration: TimeInterval? {
        presentedSnapshot().duration
    }

    public var isPlaying: Bool {
        presentedSnapshot().isPlaying
    }

    public var playbackPhase: GaplessPlaybackPhase {
        presentedSnapshot().playbackPhase
    }

    public var latestPreparationReport: GaplessPreparationReport? {
        presentedSnapshot().latestPreparationReport
    }

    public var volume: Float {
        get {
            stateStore.get().volume
        }
        set {
            playbackQueue.async { [weak self] in
                guard let self else { return }
                self.stateStore.withValue { state in
                    state.volume = newValue
                    state.outputGraph?.volume = newValue
                }
            }
        }
    }

    public func status() async -> GaplessMP3PlayerStatus {
        let queueSnapshot = await performOnPlaybackQueue {
            let absoluteTimelineTime = self.absoluteTimelineTimeOnPlaybackQueue()
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
            return (
                current: self.stateStore.get().currentSource,
                next: self.stateStore.get().nextSource,
                absoluteTimelineTime: absoluteTimelineTime
            )
        }

        await promoteCoordinatorTransitionIfNeeded()
        let runtimeStatus = await coordinator.status(
            current: queueSnapshot.current,
            next: queueSnapshot.next,
            currentTime: queueSnapshot.absoluteTimelineTime
        )
        let snapshot = presentedSnapshot()
        return GaplessMP3PlayerStatus(
            currentTime: snapshot.currentTime,
            duration: snapshot.duration,
            playbackPhase: snapshot.playbackPhase,
            isPlaying: snapshot.isPlaying,
            isReadyToPlay: runtimeStatus.isReadyToPlay,
            bufferedDuration: runtimeStatus.scheduledThroughTime,
            transitionTime: snapshot.latestPreparationReport?.next.map { _ in
                max((snapshot.latestPreparationReport?.current.trimmedDuration ?? 0) - snapshot.currentTime, 0)
            },
            currentSource: snapshot.currentSource,
            nextSource: snapshot.nextSource,
            currentSourceDownload: runtimeStatus.currentSourceDownload,
            nextSourceDownload: runtimeStatus.nextSourceDownload,
            errorDescription: runtimeStatus.errorDescription ?? snapshot.errorDescription
        )
    }

    private func startPipeline(at startTime: TimeInterval) async throws {
        await coordinator.setRuntimeEventHandler(makeRuntimeEventBridge())
        await coordinator.setHTTPLogHandler(makeHTTPLogBridge())

        try await coordinator.startPlayback(
            startTime: startTime,
            playbackPolicy: playbackPolicy,
            scheduleChunk: { [weak self] chunk in
                guard let self else { throw CancellationError() }
                try await self.scheduleChunkOnPlaybackQueue(chunk)
            },
            currentTimeProvider: { [weak self] in
                guard let self else { return startTime }
                return await self.currentAbsoluteTimelineTimeOnPlaybackQueue()
            },
            becameReady: { [weak self] in
                guard let self else { return }
                await self.handleBecameReady()
            },
            trackTransitionScheduled: { [weak self] report, boundaryTime in
                guard let self else { return }
                await self.recordPendingTransition(report: report, boundaryTime: boundaryTime)
            },
            playbackFinished: { [weak self] in
                guard let self else { return }
                await self.handlePlaybackFinished()
                await self.promoteCoordinatorTransitionIfNeeded()
            },
            playbackFailed: { [weak self] error in
                guard let self else { return }
                await self.handlePlaybackFailure(error)
            }
        )
    }

    private func playOnPlaybackQueue() {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        _ = applyPendingTrackTransitionIfNeededOnPlaybackQueue()

        guard stateStore.get().latestPreparationReport != nil else { return }
        let startTime = stateStore.get().requestedStartTime
        stateStore.withValue { state in
            state.playbackPhase = .playing
            state.publicTimelineOffset = 0
            state.lastPlaybackErrorDescription = nil
            state.outputGraph?.reset(timelineOffset: startTime)
            state.outputGraph?.requestPlay()
        }
        refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: startTime)

        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.startPipeline(at: startTime)
            } catch {
                await self.handlePlaybackFailure(error)
            }
        }
    }

    private func pauseOnPlaybackQueue() {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        let absoluteTimelineTime = absoluteTimelineTimeOnPlaybackQueue()
        _ = applyPendingTrackTransitionIfNeededOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
        let pausedTime = max(absoluteTimelineTime - stateStore.get().publicTimelineOffset, 0)

        stateStore.withValue { state in
            state.outputGraph?.pause()
            state.playbackPhase = .paused
            state.requestedStartTime = pausedTime
            state.publicTimelineOffset = 0
            state.pendingTrackTransition = nil
        }
        refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: pausedTime)

        Task { [weak self] in
            guard let self else { return }
            await self.promoteCoordinatorTransitionIfNeeded()
            await self.coordinator.stopPlayback()
        }
    }

    private func stopOutputGraphOnPlaybackQueue() {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        stateStore.withValue { state in
            state.outputGraph?.pause()
            state.outputGraph = nil
        }
    }

    private func absoluteTimelineTimeOnPlaybackQueue() -> TimeInterval {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        return stateStore.get().outputGraph?.currentTime() ?? stateStore.get().requestedStartTime
    }

    private func applyPendingTrackTransitionIfNeededOnPlaybackQueue(absoluteTimelineTime: TimeInterval? = nil) -> Bool {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        guard let pendingTrackTransition = stateStore.get().pendingTrackTransition else { return false }
        let absoluteTimelineTime = absoluteTimelineTime ?? absoluteTimelineTimeOnPlaybackQueue()
        guard absoluteTimelineTime >= pendingTrackTransition.boundaryTime else { return false }

        stateStore.withValue { state in
            let previousSource = state.currentSource
            state.publicTimelineOffset = pendingTrackTransition.boundaryTime
            state.currentSource = pendingTrackTransition.report.current.source
            state.nextSource = pendingTrackTransition.report.next?.source
            state.playbackPhase = (state.outputGraph?.isPlaying ?? false) ? .playing : .paused
            state.latestPreparationReport = pendingTrackTransition.report
            state.requestedStartTime = max(absoluteTimelineTime - pendingTrackTransition.boundaryTime, 0)
            state.pendingTrackTransition = nil
            state.coordinatorTransitionPromotionNeeded = true
            self.deliverRuntimeEvent(.trackTransitioned(previous: previousSource, current: state.currentSource))
        }
        return true
    }

    private func refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: TimeInterval? = nil) {
        dispatchPrecondition(condition: .onQueue(playbackQueue))
        let absoluteTimelineTime = absoluteTimelineTime ?? absoluteTimelineTimeOnPlaybackQueue()
        _ = applyPendingTrackTransitionIfNeededOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)

        let state = stateStore.get()
        snapshotStore.withValue { snapshot in
            snapshot.currentTime = max(absoluteTimelineTime - state.publicTimelineOffset, 0)
            snapshot.sampledAtUptime = ProcessInfo.processInfo.systemUptime
            snapshot.duration = state.latestPreparationReport?.current.trimmedDuration
            snapshot.isPlaying = state.outputGraph?.isPlaying ?? false
            snapshot.playbackPhase = state.playbackPhase
            snapshot.latestPreparationReport = state.latestPreparationReport
            snapshot.currentSource = state.currentSource
            snapshot.nextSource = state.nextSource
            snapshot.publicTimelineOffset = state.publicTimelineOffset
            snapshot.pendingTrackTransition = state.pendingTrackTransition
            snapshot.requestedStartTime = state.requestedStartTime
            snapshot.errorDescription = state.lastPlaybackErrorDescription
        }
    }

    private func presentedSnapshot() -> PresentedSnapshot {
        let rawSnapshot = snapshotStore.get()
        var currentTime = rawSnapshot.currentTime
        if rawSnapshot.isPlaying {
            currentTime += max(ProcessInfo.processInfo.systemUptime - rawSnapshot.sampledAtUptime, 0)
        }

        var latestPreparationReport = rawSnapshot.latestPreparationReport
        var currentSource = rawSnapshot.currentSource
        var nextSource = rawSnapshot.nextSource
        var duration = rawSnapshot.duration

        if let pendingTrackTransition = rawSnapshot.pendingTrackTransition {
            let absoluteTimelineTime = currentTime + rawSnapshot.publicTimelineOffset
            if absoluteTimelineTime >= pendingTrackTransition.boundaryTime {
                latestPreparationReport = pendingTrackTransition.report
                currentSource = pendingTrackTransition.report.current.source
                nextSource = pendingTrackTransition.report.next?.source
                duration = pendingTrackTransition.report.current.trimmedDuration
                currentTime = max(absoluteTimelineTime - pendingTrackTransition.boundaryTime, 0)
            }
        }

        if let duration {
            currentTime = min(max(currentTime, 0), duration)
        } else {
            currentTime = max(currentTime, 0)
        }

        return PresentedSnapshot(
            currentTime: currentTime,
            duration: duration,
            isPlaying: rawSnapshot.isPlaying,
            playbackPhase: rawSnapshot.playbackPhase,
            latestPreparationReport: latestPreparationReport,
            currentSource: currentSource,
            nextSource: nextSource,
            errorDescription: rawSnapshot.errorDescription
        )
    }

    private func promoteCoordinatorTransitionIfNeeded() async {
        let shouldPromote = await performOnPlaybackQueue {
            let shouldPromote = self.stateStore.get().coordinatorTransitionPromotionNeeded
            if shouldPromote {
                self.stateStore.withValue { $0.coordinatorTransitionPromotionNeeded = false }
            }
            return shouldPromote
        }

        guard shouldPromote else { return }
        await coordinator.promotePendingTransition()
    }

    private func scheduleChunkOnPlaybackQueue(_ chunk: PCMChunk) async throws {
        try await performOnPlaybackQueue {
            guard let outputGraph = self.stateStore.get().outputGraph else {
                throw GaplessMP3PlayerError.sourceNotPrepared
            }
            try outputGraph.schedule(chunk)
            self.refreshSnapshotOnPlaybackQueue()
        }
    }

    private func currentAbsoluteTimelineTimeOnPlaybackQueue() async -> TimeInterval {
        await performOnPlaybackQueue {
            let absoluteTimelineTime = self.absoluteTimelineTimeOnPlaybackQueue()
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
            return absoluteTimelineTime
        }
    }

    private func handleBecameReady() async {
        await performOnPlaybackQueue {
            self.stateStore.withValue {
                $0.outputGraph?.requestPlay()
                $0.playbackPhase = .playing
            }
            self.refreshSnapshotOnPlaybackQueue()
        }
    }

    private func recordPendingTransition(report: GaplessPreparationReport, boundaryTime: TimeInterval) async {
        await performOnPlaybackQueue {
            self.stateStore.withValue {
                $0.pendingTrackTransition = PendingTrackTransition(report: report, boundaryTime: boundaryTime)
            }
            self.refreshSnapshotOnPlaybackQueue()
        }
    }

    private func handlePlaybackFinished() async {
        let outcome = await performOnPlaybackQueue {
            self.stateStore.withValue {
                $0.outputGraph?.markDecodeFinished()
            }

            if self.stateStore.get().suppressPlaybackFinishedEvent {
                self.refreshSnapshotOnPlaybackQueue()
                return PlaybackFinishedOutcome.suppressed
            }

            let lastSource = self.stateStore.get().currentSource
            let didTransition = self.applyPendingTrackTransitionIfNeededOnPlaybackQueue()
            if didTransition {
                self.refreshSnapshotOnPlaybackQueue()
                return PlaybackFinishedOutcome.transitioned
            }

            self.stateStore.withValue {
                $0.playbackPhase = .stopped
            }
            self.refreshSnapshotOnPlaybackQueue()
            return PlaybackFinishedOutcome.finished(lastSource)
        }

        if case let .finished(lastSource) = outcome {
            deliverRuntimeEvent(.playbackFinished(last: lastSource))
        }
    }

    private func handlePlaybackFailure(_ error: Error) async {
        await performOnPlaybackQueue {
            self.stateStore.withValue {
                $0.playbackPhase = .failed
                $0.lastPlaybackErrorDescription = String(describing: error)
            }
            self.refreshSnapshotOnPlaybackQueue()
        }
        deliverRuntimeEvent(.playbackFailed(String(describing: error)))
    }

    private func makeRuntimeEventBridge() -> (@Sendable (GaplessRuntimeEvent) -> Void)? {
        { [weak self] event in
            self?.deliverRuntimeEvent(event)
        }
    }

    private func makeHTTPLogBridge() -> (@Sendable (GaplessHTTPLogEvent) -> Void)? {
        { [weak self] event in
            self?.deliverHTTPLogEvent(event)
        }
    }

    private func deliverRuntimeEvent(_ event: GaplessRuntimeEvent) {
        let configuration = callbackConfiguration.get()
        guard let handler = configuration.runtimeEventHandler else { return }
        (configuration.callbackQueue ?? playbackQueue).async {
            handler(event)
        }
    }

    private func deliverHTTPLogEvent(_ event: GaplessHTTPLogEvent) {
        let configuration = callbackConfiguration.get()
        guard let handler = configuration.httpLogHandler else { return }
        (configuration.callbackQueue ?? playbackQueue).async {
            handler(event)
        }
    }

    private func performOnPlaybackQueue<T>(_ operation: @escaping @Sendable () -> T) async -> T {
        await withCheckedContinuation { continuation in
            playbackQueue.async {
                continuation.resume(returning: operation())
            }
        }
    }

    private func performOnPlaybackQueue<T>(_ operation: @escaping @Sendable () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            playbackQueue.async {
                do {
                    continuation.resume(returning: try operation())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}

extension GaplessMP3Player {
    func testingSeedState(
        currentSource: GaplessPlaybackSource?,
        nextSource: GaplessPlaybackSource?,
        playbackPhase: GaplessPlaybackPhase,
        latestPreparationReport: GaplessPreparationReport?,
        pendingTransitionReport: GaplessPreparationReport? = nil,
        pendingTransitionBoundaryTime: TimeInterval? = nil,
        requestedStartTime: TimeInterval = 0,
        publicTimelineOffset: TimeInterval = 0,
        outputGraph: PCMOutputControlling? = nil,
        suppressPlaybackFinishedEvent: Bool = false
    ) async {
        await performOnPlaybackQueue {
            self.stateStore.withValue { state in
                state.outputGraph = outputGraph
                state.currentSource = currentSource
                state.nextSource = nextSource
                state.playbackPhase = playbackPhase
                state.requestedStartTime = requestedStartTime
                state.publicTimelineOffset = publicTimelineOffset
                state.pendingTrackTransition = pendingTransitionReport.map {
                    PendingTrackTransition(report: $0, boundaryTime: pendingTransitionBoundaryTime ?? 0)
                }
                state.coordinatorTransitionPromotionNeeded = false
                state.latestPreparationReport = latestPreparationReport
                state.lastPlaybackErrorDescription = nil
                state.suppressPlaybackFinishedEvent = suppressPlaybackFinishedEvent
            }
            let absoluteTimelineTime = outputGraph?.currentTime() ?? requestedStartTime
            self.refreshSnapshotOnPlaybackQueue(absoluteTimelineTime: absoluteTimelineTime)
        }
    }

    func testingHandlePlaybackFinished() async {
        await handlePlaybackFinished()
    }
}
