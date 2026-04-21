import AVFAudio
import Foundation
import MediaPlayer

private let backendCommandLog = RelistenPlaybackLogger(layer: .backend, category: .command)
private let backendLifecycleLog = RelistenPlaybackLogger(layer: .backend, category: .lifecycle)
private let backendNetworkLog = RelistenPlaybackLogger(layer: .backend, category: .network)
private let backendStateLog = RelistenPlaybackLogger(layer: .backend, category: .state)
private let backendErrorLog = RelistenPlaybackLogger(layer: .backend, category: .error)
private let resumePresentationGraceInterval: TimeInterval = 1.0

private final class BackendLockedValue<Value>: @unchecked Sendable {
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

// Mutable backend state is either confined to backendQueue/delegateQueue or protected by BackendLockedValue.
final class GaplessMP3PlayerBackend: PlaybackBackend, @unchecked Sendable {
    private struct PendingStartTimeAfterPrepare {
        let generation: UInt64
        let milliseconds: Int64
    }

    private struct ManualTrackChange: Sendable {
        let previous: RelistenGaplessStreamable?
        let current: RelistenGaplessStreamable?
    }

    private struct Snapshot {
        var currentDuration: TimeInterval?
        var elapsed: TimeInterval?
        var currentState: PlaybackState = .Stopped
        var volume: Float = 1.0
        var activeTrackDownloadedBytes: UInt64?
        var activeTrackTotalBytes: UInt64?
        var currentStreamable: RelistenGaplessStreamable?
        var nextStreamable: RelistenGaplessStreamable?
        var desiredNextStreamable: RelistenGaplessStreamable?
        var pendingStartTimeAfterPrepare: PendingStartTimeAfterPrepare?
        var generation: UInt64 = 0
        var seekSequence: UInt64 = 0
        // Transport intent is separate from renderer state. During buffering,
        // the user still wants playback even if the output graph is not yet
        // producing audio.
        var desiredTransport: MediaCenterDesiredTransport = .stopped
        // System suspension is not a user pause. It preserves whether a later
        // interruption-ended event may resume playback.
        var systemSuspension: MediaCenterSystemSuspension = .none
        // Write mode models Media Center ownership. Suppressed/frozen state is
        // what prevents stale status polling or artwork callbacks from stealing
        // the lock screen back from another app.
        var mediaCenterWriteMode: MediaCenterWriteMode = .active
        // Short-lived grace anchor for startup/resume presentation. After it
        // expires, JS can show stalled while Media Center still reflects
        // desired playback.
        var resumeStartedAtUptime: TimeInterval?
        // Raw render observations. Presentation decides how these map to JS and
        // Media Center because those two surfaces intentionally differ during
        // buffering.
        var renderStatus: MediaCenterRenderStatus = .stopped
        var renderIsPlaying = false
        var currentSessionID: String?
        var isPreparingCurrentTrack = false
        var progressPollingGeneration: UInt64?
    }

    weak var delegate: PlaybackBackendDelegate?

    var currentDurationSnapshot: TimeInterval? {
        snapshotStore.get().currentDuration
    }

    var currentStateSnapshot: PlaybackState {
        snapshotStore.get().currentState
    }

    var currentStateString: String {
        String(describing: currentStateSnapshot)
    }

    var elapsedSnapshot: TimeInterval? {
        snapshotStore.get().elapsed
    }

    var volume: Float {
        get { snapshotStore.get().volume }
        set {
            snapshotStore.withValue { $0.volume = newValue }
            backendQueue.async {
                self.player.volume = newValue
            }
        }
    }

    private let backendQueue = DispatchQueue(label: "net.relisten.ios.native-backend-queue", qos: .userInteractive)
    private let delegateQueue = DispatchQueue(label: "net.relisten.ios.native-backend-delegate-queue", qos: .userInteractive)
    private let snapshotStore = BackendLockedValue(Snapshot())
    private let teardownRequested = BackendLockedValue(false)
    private let backendInstanceID = UUID().uuidString
    private let player: GaplessMP3Player
    private let audioSessionController = AudioSessionController()
    private let playbackPresentationController = PlaybackPresentationController()
    private var wasPlayingWhenInterrupted = false
    private var secondaryAudioSilenceHintActive = AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint
    private var hasInstalledAudioSessionHandlers = false
    private var hasReportedAudioSessionSetup = false

    init(player: GaplessMP3Player = GaplessMP3Player()) {
        self.player = player
        backendLifecycleLog.info(
            "created",
            "backend instance",
            playbackLogField("id", backendInstanceID)
        )

        backendQueue.async {
            self.player.callbackQueue = self.backendQueue
            self.player.runtimeEventHandler = { [weak self] event in
                self?.handleRuntimeEvent(event)
            }
            self.player.httpLogHandler = { [weak self] event in
                self?.handleHTTPLogEvent(event)
            }
            self.player.volume = self.snapshotStore.get().volume
        }
    }

    deinit {
        backendLifecycleLog.info(
            "destroyed",
            "backend instance",
            playbackLogField("id", backendInstanceID)
        )
    }

    func enqueuePrepareAudioSession() {
        backendQueue.async {
            self.prepareAudioSessionOnQueue()
        }
    }

    func requestPlaybackProgress(_ completion: @escaping (PlaybackBackendProgressSnapshot) -> Void) {
        backendQueue.async {
            completion(self.makeProgressSnapshot(from: self.snapshotStore.get()))
        }
    }

    func enqueuePlay(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?, completion: @escaping () -> Void) {
        backendQueue.async {
            self.playOnQueue(streamable, startingAtMs: startingAtMs)
            completion()
        }
    }

    func enqueueSetNextStream(_ streamable: RelistenGaplessStreamable?) {
        backendQueue.async {
            self.setNextOnQueue(streamable)
        }
    }

    func enqueueSetRepeatMode(_ repeatMode: Int) {
        let repeatType: MPRepeatType
        switch repeatMode {
        case 2:
            repeatType = .one
        case 3:
            repeatType = .all
        default:
            repeatType = .off
        }

        DispatchQueue.main.async {
            self.audioSessionController.commandCenter.changeRepeatModeCommand.currentRepeatType = repeatType
        }
    }

    func enqueueSetShuffleMode(_ shuffleMode: Int) {
        let shuffleType: MPShuffleType = shuffleMode == 2 ? .items : .off
        DispatchQueue.main.async {
            self.audioSessionController.commandCenter.changeShuffleModeCommand.currentShuffleType = shuffleType
        }
    }

    func enqueueResume(_ completion: @escaping () -> Void) {
        backendQueue.async {
            self.resumeOnQueue()
            completion()
        }
    }

    func enqueuePause(_ completion: @escaping () -> Void) {
        backendQueue.async {
            self.pauseOnQueue()
            completion()
        }
    }

    func enqueueStop(_ completion: @escaping () -> Void) {
        backendQueue.async {
            self.stopOnQueue(emitTrackChanged: true)
            completion()
        }
    }

    func enqueueNext(_ completion: @escaping () -> Void) {
        backendQueue.async {
            self.nextOnQueue()
            completion()
        }
    }

    func enqueueSeekTo(percent: Double, completion: @escaping () -> Void) {
        backendQueue.async {
            self.seekToPercentOnQueue(percent)
            completion()
        }
    }

    func enqueueSeekToTime(_ timeMs: Int64, completion: @escaping () -> Void) {
        backendQueue.async {
            self.seekToTimeOnQueue(timeMs)
            completion()
        }
    }

    func teardown() {
        let didStartTeardown = teardownRequested.withValue { teardownRequested -> Bool in
            if teardownRequested {
                return false
            }
            teardownRequested = true
            return true
        }
        guard didStartTeardown else { return }

        backendQueue.async {
            self.stopOnQueue(emitTrackChanged: false, stopPlayer: false)
            self.hasInstalledAudioSessionHandlers = false
            self.hasReportedAudioSessionSetup = false
            Task { [weak self] in
                await self?.player.teardown()
            }
            self.audioSessionController.teardown()
            self.playbackPresentationController.teardown()
        }
    }

    private func prepareAudioSessionOnQueue() {
        prepareAudioSessionOnQueue(shouldActivate: !AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint)
    }

    private func prepareAudioSessionOnQueue(shouldActivate: Bool) {
        guard !teardownRequested.get() else { return }
        let generation = snapshotStore.get().generation
        backendCommandLog.debug(
            "entered",
            "prepareAudioSession command",
            playbackLogBoolField("shouldActivate", shouldActivate),
            playbackLogIntegerField("gen", generation)
        )

        do {
            try audioSessionController.configurePlaybackSession(shouldActivate: shouldActivate)
            installAudioSessionHandlersIfNeededOnQueue()
        } catch {
            backendErrorLog.error(
                "failed",
                "audio session setup",
                playbackLogIntegerField("gen", generation),
                playbackLogErrorField(String(describing: error))
            )
        }
    }

    private func installAudioSessionHandlersIfNeededOnQueue() {
        guard !teardownRequested.get() else { return }
        guard !hasInstalledAudioSessionHandlers else { return }

        audioSessionController.configureRemoteCommands(
            onPlay: self.handleResumeRemoteCommand,
            onPause: self.handlePauseRemoteCommand,
            onTogglePlayPause: self.handleTogglePlayPauseRemoteCommand,
            onSeek: self.handleSeekRemoteCommand,
            onNextTrack: self.handleNextTrackRemoteCommand,
            onPreviousTrack: self.handlePreviousTrackRemoteCommand
        )
        audioSessionController.configureSessionObservers(
            onRouteChange: { [weak self] event in
                self?.backendQueue.async {
                    self?.handleRouteChangeOnQueue(event)
                }
            },
            onInterruption: { [weak self] event in
                self?.backendQueue.async {
                    self?.handleInterruptionOnQueue(event)
                }
            },
            onSilenceSecondaryAudioHint: { [weak self] event in
                self?.backendQueue.async {
                    self?.handleSilenceSecondaryAudioHintOnQueue(event)
                }
            },
            onMediaServices: { [weak self] kind in
                self?.backendQueue.async {
                    self?.handleMediaServicesOnQueue(kind)
                }
            }
        )
        guard !teardownRequested.get() else { return }
        audioSessionController.beginReceivingRemoteControlEvents()
        hasInstalledAudioSessionHandlers = true
        guard !hasReportedAudioSessionSetup else { return }
        hasReportedAudioSessionSetup = true
        backendStateLog.info(
            "succeeded",
            "audio session setup",
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        delegateQueue.async {
            self.delegate?.audioSessionWasSetup()
        }
    }

    private func playOnQueue(
        _ streamable: RelistenGaplessStreamable,
        startingAtMs: Int64?,
        manualTrackChange: ManualTrackChange? = nil
    ) {
        let entryGeneration = snapshotStore.get().generation
        backendCommandLog.debug(
            "entered",
            "play command",
            playbackLogField("src", streamable.identifier),
            playbackLogField("startMs", startingAtMs.map { String($0) }),
            playbackLogIntegerField("gen", entryGeneration)
        )
        prepareAudioSessionOnQueue(shouldActivate: true)

        let snapshot = snapshotStore.get()
        let previousStreamable = snapshot.currentStreamable

        if let nextStreamable = snapshot.nextStreamable,
           nextStreamable.identifier == streamable.identifier,
           startingAtMs == nil {
            nextOnQueue()
            return
        }

        if let currentStreamable = snapshot.currentStreamable,
           currentStreamable.identifier == streamable.identifier,
           let startingAtMs {
            if snapshot.isPreparingCurrentTrack {
                // JS can request a start offset while the native prepare is
                // still loading metadata. Store the seek with the current
                // generation so a superseded prepare cannot consume it later.
                snapshotStore.withValue {
                    $0.pendingStartTimeAfterPrepare = PendingStartTimeAfterPrepare(
                        generation: $0.generation,
                        milliseconds: max(startingAtMs, 0)
                    )
                }
                backendLifecycleLog.debug(
                    "accepted",
                    "post-prepare seek",
                    playbackLogIntegerField("timeMs", startingAtMs),
                    playbackLogIntegerField("gen", snapshot.generation)
                )
                return
            }
            seekToTimeOnQueue(startingAtMs)
            return
        }

        let previous = snapshot
        let (generation, sessionID) = snapshotStore.withValue { snapshot in
            // A new generation is the backend's boundary for stale async status,
            // progress, and presentation work. It does not cancel the lower
            // level player operation by itself; every await below re-checks this
            // token before publishing back into app/Media Center state.
            var supersessionState = PlaySupersessionState(activeGeneration: snapshot.generation)
            let generation = supersessionState.beginPlayRequest()
            let sessionID = UUID().uuidString
            snapshot.generation = generation
            snapshot.seekSequence = 0
            snapshot.currentSessionID = sessionID
            snapshot.desiredTransport = .playing
            snapshot.systemSuspension = .none
            snapshot.mediaCenterWriteMode = .active
            snapshot.resumeStartedAtUptime = ProcessInfo.processInfo.systemUptime
            snapshot.renderStatus = .preparing
            snapshot.renderIsPlaying = false
            snapshot.currentStreamable = streamable
            snapshot.nextStreamable = nil
            snapshot.desiredNextStreamable = nil
            snapshot.currentDuration = nil
            snapshot.elapsed = nil
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.pendingStartTimeAfterPrepare = startingAtMs.map {
                PendingStartTimeAfterPrepare(
                    generation: generation,
                    milliseconds: max($0, 0)
                )
            }
            snapshot.isPreparingCurrentTrack = true
            snapshot.progressPollingGeneration = nil
            return (generation, sessionID)
        }
        player.sessionID = sessionID
        applyPresentationAndEmit(previous: previous)
        scheduleResumeGraceExpirationIfNeededOnQueue(for: generation)
        backendCommandLog.info(
            "accepted",
            "playback request",
            playbackLogField("src", streamable.identifier),
            playbackLogIntegerField("gen", generation)
        )

        let currentSource = makePlaybackSource(from: streamable)
        Task { [weak self] in
            guard let self else { return }
            do {
                backendLifecycleLog.debug(
                    "stopping",
                    "old session before prepare",
                    playbackLogIntegerField("gen", generation)
                )
                // Reset the old output graph before preparing the new source so
                // audible old audio cannot continue behind the next lock-screen
                // item. The generation checks that follow keep stale results
                // from being presented if the user already chose another track.
                await self.player.stop()
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try await self.player.prepare(current: currentSource, next: nil)
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                if let seekTime = self.consumePendingStartTimeAfterPrepareOnQueue(for: generation), seekTime > 0 {
                    try await self.player.seek(to: seekTime)
                    backendLifecycleLog.debug(
                        "applied",
                        "post-prepare seek",
                        playbackLogIntegerField("timeMs", Int64(seekTime * 1000)),
                        playbackLogIntegerField("gen", generation)
                    )
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                }

                guard self.shouldContinueAsyncWork(for: generation) else { return }
                if self.snapshotStore.get().desiredTransport == .playing {
                    _ = self.player.play()
                    self.backendQueue.async {
                        guard self.shouldContinueAsyncWork(for: generation) else { return }
                        self.startProgressPollingIfNeededOnQueue(for: generation)
                    }
                }
                let status = await self.player.status()
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    self.snapshotStore.withValue { $0.isPreparingCurrentTrack = false }
                    if let manualTrackChange {
                        self.delegateQueue.async {
                            self.delegate?.trackChanged(
                                previousStreamable: manualTrackChange.previous,
                                currentStreamable: manualTrackChange.current
                            )
                        }
                    } else if previousStreamable?.identifier != streamable.identifier {
                        self.delegateQueue.async {
                            self.delegate?.trackChanged(
                                previousStreamable: previousStreamable,
                                currentStreamable: streamable
                            )
                        }
                    }
                    self.applyStatus(status)
                    self.applyLatestDesiredNextIfNeededOnQueue(for: generation)
                }
            } catch {
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    let previous = self.snapshotStore.get()
                    self.snapshotStore.withValue {
                        $0.desiredTransport = .stopped
                        $0.systemSuspension = .none
                        $0.mediaCenterWriteMode = .active
                        $0.resumeStartedAtUptime = nil
                        $0.renderStatus = .failed
                        $0.renderIsPlaying = false
                        $0.currentStreamable = nil
                        $0.nextStreamable = nil
                        $0.desiredNextStreamable = nil
                        $0.activeTrackDownloadedBytes = nil
                        $0.activeTrackTotalBytes = nil
                        $0.isPreparingCurrentTrack = false
                        $0.pendingStartTimeAfterPrepare = nil
                        $0.currentState = .Stopped
                    }
                    self.applyPresentationAndEmit(previous: previous)
                    self.emitError(error, for: streamable)
                }
            }
        }
    }

    private func setNextOnQueue(_ streamable: RelistenGaplessStreamable?) {
        backendCommandLog.debug(
            "entered",
            "setNext command",
            playbackLogField("next", streamable?.identifier),
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        let (snapshot, requestAction) = snapshotStore.withValue { snapshot -> (Snapshot, NextStreamSupersessionRequestAction) in
            var supersessionState = NextStreamSupersessionState(
                hasCurrentTrack: snapshot.currentStreamable != nil,
                appliedNextIdentifier: snapshot.nextStreamable?.identifier,
                desiredNextIdentifier: snapshot.desiredNextStreamable?.identifier,
                isPreparingCurrentTrack: snapshot.isPreparingCurrentTrack
            )
            let requestAction = supersessionState.request(streamable?.identifier)
            snapshot.desiredNextStreamable = streamable
            if !supersessionState.hasCurrentTrack {
                snapshot.nextStreamable = streamable
            }
            return (snapshot, requestAction)
        }

        guard snapshot.currentStreamable != nil else { return }
        guard requestAction == .applyRequestedNextImmediately else { return }

        let generation = snapshot.generation
        Task { [weak self] in
            guard let self else { return }
            do {
                guard self.snapshotStore.get().generation == generation else { return }
                try await self.player.setNext(streamable.map(self.makePlaybackSource(from:)))
                let status = await self.player.status()
                self.backendQueue.async {
                    guard self.snapshotStore.get().generation == generation else { return }
                    guard self.snapshotStore.get().desiredNextStreamable?.identifier == streamable?.identifier else {
                        self.applyLatestDesiredNextIfNeededOnQueue(for: generation)
                        return
                    }
                    self.snapshotStore.withValue { $0.nextStreamable = streamable }
                    self.applyStatus(status)
                }
            } catch {
                self.backendQueue.async {
                    guard self.snapshotStore.get().generation == generation else { return }
                    if let currentStreamable = self.snapshotStore.get().currentStreamable {
                        self.emitError(error, for: currentStreamable)
                    }
                }
            }
        }
    }

    private func resumeOnQueue() {
        backendCommandLog.debug(
            "entered",
            "resume command",
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        let entrySnapshot = snapshotStore.get()
        ResumeCommandState(
            isStopped: entrySnapshot.currentState == .Stopped || entrySnapshot.currentStreamable == nil
        ).perform(
            prepareAudioSession: { self.prepareAudioSessionOnQueue(shouldActivate: true) },
            play: { self.player.play() },
            updateStateToPlaying: {
                self.updateSnapshotOnQueue {
                    $0.desiredTransport = .playing
                    $0.systemSuspension = .none
                    $0.mediaCenterWriteMode = .active
                    $0.resumeStartedAtUptime = ProcessInfo.processInfo.systemUptime
                    $0.renderStatus = .paused
                    $0.renderIsPlaying = false
                }
                self.scheduleResumeGraceExpirationIfNeededOnQueue(for: self.snapshotStore.get().generation)
                self.startProgressPollingIfNeededOnQueue(for: self.snapshotStore.get().generation)
            }
        )
    }

    private func pauseOnQueue() {
        backendCommandLog.debug(
            "entered",
            "pause command",
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        player.pause()
        updateSnapshotOnQueue {
            $0.desiredTransport = .paused
            $0.systemSuspension = .none
            $0.mediaCenterWriteMode = .active
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .paused
            $0.renderIsPlaying = false
            guard $0.currentState != .Stopped else { return }
            $0.currentState = .Paused
        }
        refreshStatusOnQueue(for: snapshotStore.get().generation)
    }

    private func stopOnQueue(
        emitTrackChanged: Bool,
        shouldInvalidateGeneration: Bool = true,
        stopPlayer: Bool = true
    ) {
        backendCommandLog.debug(
            "entered",
            "stop command",
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        let previous = snapshotStore.get()
        let previousStreamable = previous.currentStreamable
        snapshotStore.withValue { snapshot in
            if shouldInvalidateGeneration {
                snapshot.generation += 1
                snapshot.seekSequence = 0
            }
            snapshot.currentSessionID = nil
            snapshot.desiredTransport = .stopped
            snapshot.systemSuspension = .none
            snapshot.mediaCenterWriteMode = .active
            snapshot.resumeStartedAtUptime = nil
            snapshot.renderStatus = .stopped
            snapshot.renderIsPlaying = false
            snapshot.currentStreamable = nil
            snapshot.nextStreamable = nil
            snapshot.desiredNextStreamable = nil
            snapshot.currentDuration = nil
            snapshot.elapsed = nil
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.pendingStartTimeAfterPrepare = nil
            snapshot.currentState = .Stopped
            snapshot.isPreparingCurrentTrack = false
            snapshot.progressPollingGeneration = nil
        }
        player.sessionID = nil
        applyPresentationAndEmit(previous: previous)
        if emitTrackChanged, let previousStreamable {
            delegateQueue.async {
                self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: nil)
            }
        }

        guard stopPlayer else { return }
        Task { [weak self] in
            await self?.player.stop()
        }
    }

    private func nextOnQueue() {
        backendCommandLog.debug(
            "entered",
            "next command",
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        let (snapshot, nextAction) = snapshotStore.withValue { snapshot -> (Snapshot, NextCommandAction) in
            var nextCommandState = NextCommandState(
                hasCurrentTrack: snapshot.currentStreamable != nil,
                preparedNextIdentifier: snapshot.nextStreamable?.identifier,
                desiredNextIdentifier: snapshot.desiredNextStreamable?.identifier,
                activeGeneration: snapshot.generation
            )
            let action = nextCommandState.resolve()
            if case .stopCurrentTrack(let invalidatedGeneration) = action {
                snapshot.generation = invalidatedGeneration
                snapshot.seekSequence = 0
            }
            return (snapshot, action)
        }

        switch nextAction {
        case .noOp:
            backendCommandLog.warn(
                "ignored",
                "next command, no next track queued",
                playbackLogIntegerField("gen", snapshot.generation)
            )
            return
        case .stopCurrentTrack:
            stopOnQueue(emitTrackChanged: true, shouldInvalidateGeneration: false)
            return
        case .playQueuedNext:
            break
        }

        guard let nextStreamable = snapshot.nextStreamable ?? snapshot.desiredNextStreamable else { return }

        snapshotStore.withValue {
            $0.desiredNextStreamable = nil
            $0.nextStreamable = nil
        }
        playOnQueue(
            nextStreamable,
            startingAtMs: nil,
            manualTrackChange: ManualTrackChange(previous: snapshot.currentStreamable, current: nextStreamable)
        )
    }

    private func seekToPercentOnQueue(_ percent: Double) {
        backendCommandLog.debug(
            "entered",
            "seekTo command",
            playbackLogDoubleField("pct", percent),
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        guard percent.isFinite else { return }
        let normalizedPercent = max(0, min(percent, 1))
        if normalizedPercent >= 1 {
            emitRemoteControl("nextTrack")
            return
        }

        guard let duration = snapshotStore.get().currentDuration else {
            backendCommandLog.warn(
                "ignored",
                "seek command, no active track",
                playbackLogIntegerField("gen", snapshotStore.get().generation)
            )
            return
        }
        seekOnQueue(to: duration * normalizedPercent)
    }

    private func seekToTimeOnQueue(_ timeMs: Int64) {
        backendCommandLog.debug(
            "entered",
            "seekToTime command",
            playbackLogIntegerField("timeMs", timeMs),
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        guard snapshotStore.get().currentStreamable != nil else {
            backendCommandLog.warn(
                "ignored",
                "seek command, no active track",
                playbackLogIntegerField("gen", snapshotStore.get().generation)
            )
            return
        }
        seekOnQueue(to: max(Double(timeMs) / 1000, 0))
    }

    private func seekOnQueue(to time: TimeInterval) {
        let state = snapshotStore.withValue { snapshot in
            let hasCurrentTrack = snapshot.currentStreamable != nil
            if hasCurrentTrack {
                snapshot.seekSequence += 1
            }
            return SeekCommandState(
                hasCurrentTrack: hasCurrentTrack,
                currentDuration: snapshot.currentDuration,
                requestedTime: time,
                activeGeneration: snapshot.generation,
                seekSequence: snapshot.seekSequence
            )
        }
        guard let execution = state.begin(updateElapsed: { clampedTime in
            let previous = self.snapshotStore.get()
            self.snapshotStore.withValue { snapshot in
                snapshot.elapsed = clampedTime
            }
            self.applyPresentationAndEmit(previous: previous)
        }) else { return }

        Task { [weak self] in
            guard let self else { return }
            await execution.perform(
                seek: { time in
                    try await self.player.seek(to: time)
                },
                status: {
                    await self.player.status()
                },
                complete: { status in
                    self.backendQueue.async {
                        let snapshot = self.snapshotStore.get()
                        guard execution.shouldApplyResult(
                            activeGeneration: snapshot.generation,
                            currentSeekSequence: snapshot.seekSequence
                        ) else { return }
                        self.applyStatus(status)
                    }
                },
                emitError: { error in
                    self.backendQueue.async {
                        let snapshot = self.snapshotStore.get()
                        guard execution.shouldApplyResult(
                            activeGeneration: snapshot.generation,
                            currentSeekSequence: snapshot.seekSequence
                        ) else { return }
                        if let currentStreamable = self.snapshotStore.get().currentStreamable {
                            self.emitError(error, for: currentStreamable)
                        }
                    }
                }
            )
        }
    }

    private func refreshStatusOnQueue(for generation: UInt64) {
        Task { [weak self] in
            guard let self else { return }
            let status = await self.player.status()
            self.backendQueue.async {
                let snapshot = self.snapshotStore.get()
                guard snapshot.generation == generation else { return }
                guard !self.shouldIgnoreStatus(for: snapshot) else {
                    // Suppression is about Media Center ownership. Even harmless
                    // looking status refreshes can restart polling or rewrite
                    // presentation, so they are ignored until explicit Relisten
                    // resume makes writes active again.
                    self.logIgnoredStatusDuringSuppression(snapshot: snapshot)
                    return
                }
                self.applyStatus(status)
            }
        }
    }

    private func applyLatestDesiredNextIfNeededOnQueue(for generation: UInt64) {
        let snapshot = snapshotStore.get()
        guard snapshot.generation == generation else { return }
        let supersessionState = NextStreamSupersessionState(
            hasCurrentTrack: snapshot.currentStreamable != nil,
            appliedNextIdentifier: snapshot.nextStreamable?.identifier,
            desiredNextIdentifier: snapshot.desiredNextStreamable?.identifier,
            isPreparingCurrentTrack: snapshot.isPreparingCurrentTrack
        )
        guard supersessionState.reconcileAfterPrepare() == .applyDesiredNext else { return }
        setNextOnQueue(snapshot.desiredNextStreamable)
    }

    private func applyStatus(_ status: GaplessMP3PlayerStatus) {
        let previous = snapshotStore.get()
        guard !shouldIgnoreStatus(for: previous) else {
            // The native player may still have a source prepared after Spotify
            // or another app takes over. Do not let that prepared status
            // recreate a Relisten lock-screen item.
            logIgnoredStatusDuringSuppression(snapshot: previous)
            return
        }
        let currentStreamable = streamableMatching(id: status.currentSource?.id, snapshot: previous)
        let nextStreamable = streamableMatching(id: status.nextSource?.id, snapshot: previous)
        let downloadedBytes = unsignedValue(status.currentSourceDownload?.downloadedBytes)
        let totalBytes = unsignedValue(status.currentSourceDownload?.expectedBytes)

        if let currentSource = status.currentSource, currentStreamable == nil {
            // Active playback without a Relisten streamable would publish blank
            // or mismatched lock-screen metadata. Treat it as an invariant
            // failure and clear instead.
            backendErrorLog.error(
                "failed",
                "status current source metadata resolution",
                playbackLogField("nativeSrc", currentSource.id),
                playbackLogField("current", previous.currentStreamable?.identifier),
                playbackLogField("next", previous.nextStreamable?.identifier),
                playbackLogField("desiredNext", previous.desiredNextStreamable?.identifier),
                playbackLogIntegerField("gen", previous.generation)
            )
            stopOnQueue(emitTrackChanged: true)
            return
        }

        snapshotStore.withValue { snapshot in
            snapshot.currentDuration = status.duration
            snapshot.elapsed = status.currentTime
            snapshot.renderStatus = renderStatus(for: status.playbackPhase)
            snapshot.renderIsPlaying = status.isPlaying
            snapshot.currentStreamable = status.currentSource == nil ? nil : currentStreamable
            snapshot.nextStreamable = status.nextSource == nil ? nil : nextStreamable
            snapshot.activeTrackDownloadedBytes = downloadedBytes
            snapshot.activeTrackTotalBytes = totalBytes
            snapshot.isPreparingCurrentTrack = status.playbackPhase == .preparing
            if status.isPlaying, status.playbackPhase == .playing {
                snapshot.resumeStartedAtUptime = nil
            }
            if status.playbackPhase == .stopped || status.currentSource == nil {
                snapshot.progressPollingGeneration = nil
            }
        }

        let current = applyPresentationAndEmit(previous: previous)
        logStatusApplication(status: status, snapshot: current)
        translateStreamingCacheCompletionIfNeeded(status: status, snapshot: current)
        if shouldKeepProgressPolling(for: current) {
            startProgressPollingIfNeededOnQueue(for: current.generation)
        }
    }

    private func handleRuntimeEvent(_ event: GaplessRuntimeEvent) {
        guard !teardownRequested.get() else { return }
        guard let eventSessionID = event.sessionID, eventSessionID == snapshotStore.get().currentSessionID else {
            return
        }
        switch event {
        case .playbackFailed(let failure, _):
            let previous = snapshotStore.get()
            snapshotStore.withValue {
                $0.renderStatus = .failed
                $0.renderIsPlaying = false
                $0.resumeStartedAtUptime = nil
            }
            applyPresentationAndEmit(previous: previous)
            if let currentStreamable = previous.currentStreamable {
                emitError(failure, for: currentStreamable)
            }
        case .networkRetrying:
            backendStateLog.debug(
                "retrying",
                "network playback",
                playbackLogIntegerField("gen", snapshotStore.get().generation)
            )
        case .trackTransitioned(let previous, let current, _):
            let snapshot = snapshotStore.get()
            let previousStreamable = streamableMatching(id: previous?.id, snapshot: snapshot) ?? snapshot.currentStreamable
            let currentStreamable = streamableMatching(id: current?.id, snapshot: snapshot)
            guard current == nil || currentStreamable != nil else {
                // Do not publish the new native current source until it maps
                // back to Relisten metadata. That avoids an active tile with nil
                // title/artwork during gapless handoff races.
                backendErrorLog.error(
                    "failed",
                    "track transition metadata resolution",
                    playbackLogField("nativePrev", previous?.id),
                    playbackLogField("nativeCurrent", current?.id),
                    playbackLogField("current", snapshot.currentStreamable?.identifier),
                    playbackLogField("next", snapshot.nextStreamable?.identifier),
                    playbackLogField("desiredNext", snapshot.desiredNextStreamable?.identifier),
                    playbackLogIntegerField("gen", snapshot.generation)
                )
                stopOnQueue(emitTrackChanged: true)
                return
            }
            guard let currentStreamable else {
                stopOnQueue(emitTrackChanged: true)
                return
            }
            backendStateLog.info(
                "committed",
                "track transition",
                playbackLogField("nativePrev", previous?.id),
                playbackLogField("nativeCurrent", current?.id),
                playbackLogField("prev", previousStreamable?.identifier),
                playbackLogField("current", currentStreamable.identifier),
                playbackLogField("oldNext", snapshot.nextStreamable?.identifier),
                playbackLogField("oldDesiredNext", snapshot.desiredNextStreamable?.identifier),
                playbackLogField("sess", eventSessionID),
                playbackLogIntegerField("gen", snapshot.generation)
            )
            let previousSnapshot = snapshot
            snapshotStore.withValue {
                $0.currentStreamable = currentStreamable
                $0.nextStreamable = nil
                $0.desiredNextStreamable = nil
                $0.currentDuration = nil
                $0.elapsed = nil
            }
            // Apply immediately so the old track does not remain visible at
            // 100% while the status round trip fetches the new duration/elapsed.
            applyPresentationAndEmit(previous: previousSnapshot)
            delegateQueue.async {
                self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: currentStreamable)
            }
            refreshStatusOnQueue(for: snapshot.generation)
        case .playbackFinished(let last, _):
            let snapshot = snapshotStore.get()
            guard snapshot.currentStreamable?.identifier == last?.id else { return }
            backendStateLog.info(
                "finished",
                "playback",
                playbackLogField("last", last?.id),
                playbackLogField("sess", eventSessionID),
                playbackLogIntegerField("gen", snapshot.generation)
            )
            let previousStreamable = snapshot.currentStreamable
            snapshotStore.withValue { snapshot in
                snapshot.generation += 1
                snapshot.seekSequence = 0
                snapshot.currentSessionID = nil
                snapshot.desiredTransport = .stopped
                snapshot.systemSuspension = .none
                snapshot.mediaCenterWriteMode = .active
                snapshot.resumeStartedAtUptime = nil
                snapshot.renderStatus = .stopped
                snapshot.renderIsPlaying = false
                snapshot.currentState = .Stopped
                snapshot.currentStreamable = nil
                snapshot.nextStreamable = nil
                snapshot.desiredNextStreamable = nil
                snapshot.currentDuration = nil
                snapshot.elapsed = nil
                snapshot.activeTrackDownloadedBytes = nil
                snapshot.activeTrackTotalBytes = nil
                snapshot.pendingStartTimeAfterPrepare = nil
                snapshot.isPreparingCurrentTrack = false
                snapshot.progressPollingGeneration = nil
            }
            player.sessionID = nil
            applyPresentationAndEmit(previous: snapshot)
            if let previousStreamable {
                delegateQueue.async {
                    self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: nil)
                }
            }
        }
    }

    private func handleHTTPLogEvent(_ event: GaplessHTTPLogEvent) {
        backendQueue.async {
            guard !self.teardownRequested.get() else { return }
            guard let eventSessionID = event.sessionID, eventSessionID == self.snapshotStore.get().currentSessionID else {
                return
            }
            let snapshot = self.snapshotStore.get()
            let trackedIdentifiers = [
                snapshot.currentStreamable?.identifier,
                snapshot.nextStreamable?.identifier,
                snapshot.desiredNextStreamable?.identifier,
            ]
            guard trackedIdentifiers.contains(where: { $0 == event.sourceID }) else { return }

            let generation = snapshot.generation
            let requestURL = event.url.absoluteString
            let requestedRange = event.requestHeaders["Range"] ?? event.requestHeaders["range"]
            let contentRange = event.responseHeaders["Content-Range"] ?? event.responseHeaders["content-range"]
            switch event.kind {
            case .requestStarted:
                backendNetworkLog.info(
                    "started",
                    "HTTP request",
                    playbackLogField("kind", event.requestKind.rawValue),
                    playbackLogField("src", event.sourceID),
                    playbackLogField("url", requestURL),
                    playbackLogField("range", requestedRange),
                    playbackLogIntegerField("attempt", event.attempt),
                    playbackLogIntegerField("gen", generation)
                )
            case .requestCompleted:
                backendNetworkLog.info(
                    "completed",
                    "HTTP request",
                    playbackLogField("kind", event.requestKind.rawValue),
                    playbackLogField("src", event.sourceID),
                    playbackLogField("url", requestURL),
                    playbackLogField("range", requestedRange),
                    playbackLogField("contentRange", contentRange),
                    playbackLogField("status", event.statusCode.map { String($0) }),
                    playbackLogIntegerField("attempt", event.attempt),
                    playbackLogField("bytes", event.cumulativeBytes.map { String($0) }),
                    playbackLogIntegerField("gen", generation)
                )
            case .requestPromoted:
                backendNetworkLog.info(
                    "upgraded",
                    "HTTP request",
                    playbackLogField("src", event.sourceID),
                    playbackLogField("from", event.previousRequestKind?.rawValue),
                    playbackLogField("to", event.requestKind.rawValue),
                    playbackLogField("url", requestURL),
                    playbackLogField("range", requestedRange),
                    playbackLogField("bytes", event.cumulativeBytes.map { String($0) }),
                    playbackLogIntegerField("gen", generation)
                )
            case .retryScheduled:
                let retryAttempt = min(event.attempt + 1, event.maxAttempts)
                backendNetworkLog.info(
                    "scheduled",
                    "retry",
                    playbackLogField("src", event.sourceID),
                    playbackLogField("attempt", "\(retryAttempt)/\(event.maxAttempts)"),
                    playbackLogDelayField(event.retryDelay),
                    playbackLogIntegerField("gen", generation)
                )
            case .resumeAttempt:
                backendNetworkLog.info(
                    "started",
                    "resume attempt",
                    playbackLogField("kind", event.requestKind.rawValue),
                    playbackLogField("src", event.sourceID),
                    playbackLogField("url", requestURL),
                    playbackLogField("range", requestedRange),
                    playbackLogIntegerField("attempt", event.attempt),
                    playbackLogIntegerField("gen", generation)
                )
            case .requestFailed:
                if event.retryDelay == nil {
                    backendErrorLog.error(
                        "failed",
                        "HTTP request",
                        playbackLogField("kind", event.requestKind.rawValue),
                        playbackLogField("src", event.sourceID),
                        playbackLogField("url", requestURL),
                        playbackLogField("range", requestedRange),
                        playbackLogField("contentRange", contentRange),
                        playbackLogField("status", event.statusCode.map { String($0) }),
                        playbackLogIntegerField("attempt", event.attempt),
                        playbackLogIntegerField("gen", generation),
                        playbackLogErrorField(event.errorDescription ?? "unknown")
                    )
                }
            case .responseReceived, .bytesReceived:
                break
            }

            if event.requestKind == .progressive && event.kind == .requestCompleted {
                self.refreshStatusOnQueue(for: snapshot.generation)
            }
        }
    }

    private func makePlaybackSource(from streamable: RelistenGaplessStreamable) -> GaplessPlaybackSource {
        GaplessPlaybackSource(
            id: streamable.identifier,
            url: streamable.url,
            cacheKey: streamable.cacheKey,
            headers: [:],
            expectedContentLength: nil
        )
    }

    private func makeProgressSnapshot(from snapshot: Snapshot) -> PlaybackBackendProgressSnapshot {
        PlaybackBackendProgressSnapshot(
            elapsed: snapshot.elapsed,
            duration: snapshot.currentDuration,
            activeTrackDownloadedBytes: snapshot.activeTrackDownloadedBytes,
            activeTrackTotalBytes: snapshot.activeTrackTotalBytes
        )
    }

    private func shouldKeepProgressPolling(for snapshot: Snapshot) -> Bool {
        guard snapshot.currentStreamable != nil else { return false }
        guard !shouldIgnoreStatus(for: snapshot) else { return false }

        switch snapshot.currentState {
        case .Playing, .Paused, .Stalled:
            return true
        case .Stopped:
            return false
        }
    }

    private func streamableMatching(id: String?, snapshot: Snapshot) -> RelistenGaplessStreamable? {
        guard let id else { return nil }
        if snapshot.currentStreamable?.identifier == id {
            return snapshot.currentStreamable
        }
        if snapshot.nextStreamable?.identifier == id {
            return snapshot.nextStreamable
        }
        if snapshot.desiredNextStreamable?.identifier == id {
            return snapshot.desiredNextStreamable
        }
        return nil
    }

    private func shouldIgnoreStatus(for snapshot: Snapshot) -> Bool {
        // External-media suppression is stronger than renderer truth. The
        // player can still report a prepared source, but Relisten has yielded
        // lock-screen ownership until the user explicitly resumes Relisten.
        snapshot.mediaCenterWriteMode == .suppressed || snapshot.systemSuspension == .externalMedia
    }

    private func logIgnoredStatusDuringSuppression(snapshot: Snapshot) {
        backendStateLog.debug(
            "ignored",
            "status during media center suppression",
            playbackLogField("write", snapshot.mediaCenterWriteMode.rawValue),
            playbackLogField("susp", snapshot.systemSuspension.rawValue),
            playbackLogField("src", snapshot.currentStreamable?.identifier),
            playbackLogIntegerField("gen", snapshot.generation)
        )
    }

    @discardableResult
    private func applyPresentationAndEmit(previous: Snapshot, freezeAfterUpdate: Bool = false) -> Snapshot {
        // Presentation is the only place that translates native renderer facts
        // into both JS state and Media Center state. Keeping delegate emission
        // adjacent to that write makes the two surfaces easier to reason about.
        let current = applyPresentationOnQueue(freezeAfterUpdate: freezeAfterUpdate)
        emitStateIfNeeded(previous: previous.currentState, current: current.currentState)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
        return current
    }

    @discardableResult
    private func applyPresentationOnQueue(freezeAfterUpdate: Bool = false) -> Snapshot {
        let now = ProcessInfo.processInfo.systemUptime
        let (snapshot, decision) = snapshotStore.withValue { snapshot -> (Snapshot, MediaCenterPresentationDecision) in
            let decision = resolvePresentationDecision(for: snapshot, now: now)
            if let appState = appState(for: decision) {
                snapshot.currentState = playbackState(from: appState)
            }
            return (snapshot, decision)
        }

        logPresentationDecision(decision, snapshot: snapshot)

        switch decision {
        case .clear:
            playbackPresentationController.apply(nil)
        case .freeze:
            playbackPresentationController.freeze()
        case .update(let update):
            if let presentationSnapshot = makePresentationSnapshot(from: snapshot, update: update) {
                if freezeAfterUpdate {
                    playbackPresentationController.applyAndFreeze(presentationSnapshot)
                } else {
                    playbackPresentationController.apply(presentationSnapshot)
                }
            } else {
                playbackPresentationController.apply(nil)
            }
        }

        return snapshot
    }

    private func resolvePresentationDecision(
        for snapshot: Snapshot,
        now: TimeInterval
    ) -> MediaCenterPresentationDecision {
        MediaCenterPresentationInput(
            hasCurrentMetadata: snapshot.currentStreamable != nil,
            desiredTransport: snapshot.desiredTransport,
            systemSuspension: snapshot.systemSuspension,
            writeMode: snapshot.mediaCenterWriteMode,
            renderStatus: snapshot.renderStatus,
            renderIsPlaying: snapshot.renderIsPlaying,
            isWithinResumeGraceWindow: isWithinResumeGraceWindow(snapshot: snapshot, now: now)
        ).resolve()
    }

    private func isWithinResumeGraceWindow(snapshot: Snapshot, now: TimeInterval) -> Bool {
        guard let resumeStartedAtUptime = snapshot.resumeStartedAtUptime else {
            return false
        }
        // The grace window is deliberately short and presentation-only: it
        // prevents startup flicker, but it does not keep JS .Playing once the
        // renderer remains unconfirmed past the window.
        return now - resumeStartedAtUptime <= resumePresentationGraceInterval
    }

    private func appState(
        for decision: MediaCenterPresentationDecision
    ) -> MediaCenterAppState? {
        switch decision {
        case .update(let update):
            return update.appState
        case .clear(let reason):
            switch reason {
            case .stopped, .missingMetadata:
                return .stopped
            case .externalMedia, .temporaryInterruption, .userPaused, .awaitingRender, .buffering, .renderStoppedUnexpectedly, .playing:
                return nil
            }
        case .freeze:
            return nil
        }
    }

    private func playbackState(from appState: MediaCenterAppState) -> PlaybackState {
        switch appState {
        case .stopped:
            return .Stopped
        case .playing:
            return .Playing
        case .paused:
            return .Paused
        case .stalled:
            return .Stalled
        }
    }

    private func makePresentationSnapshot(
        from snapshot: Snapshot,
        update: MediaCenterPresentationUpdate
    ) -> PlaybackPresentationController.Snapshot? {
        guard let streamable = snapshot.currentStreamable else {
            return nil
        }

        return PlaybackPresentationController.Snapshot(
            title: streamable.title,
            artist: streamable.artist,
            album: streamable.albumTitle,
            duration: snapshot.currentDuration,
            elapsed: snapshot.elapsed,
            rate: update.playbackRate,
            artworkURL: URL(string: streamable.albumArt),
            mediaCenterPlaybackState: mediaCenterPlaybackState(from: update.mediaCenterPlaybackState)
        )
    }

    private func mediaCenterPlaybackState(
        from state: MediaCenterPlaybackState
    ) -> MPNowPlayingPlaybackState {
        switch state {
        case .stopped:
            return .stopped
        case .playing:
            return .playing
        case .paused:
            return .paused
        case .interrupted:
            return .interrupted
        }
    }

    private func logPresentationDecision(
        _ decision: MediaCenterPresentationDecision,
        snapshot: Snapshot
    ) {
        var intent = "update"
        var appState = playbackLogField("app", nil)
        var mediaCenterState = playbackLogField("mc", nil)
        var rate = playbackLogField("rate", nil)

        switch decision {
        case .clear:
            intent = "clear"
        case .freeze:
            intent = "freeze"
        case .update(let update):
            appState = playbackLogField("app", update.appState.rawValue)
            mediaCenterState = playbackLogField("mc", update.mediaCenterPlaybackState.rawValue)
            rate = playbackLogField("rate", String(update.playbackRate))
        }

        backendStateLog.debug(
            "resolved",
            "presentation decision",
            playbackLogField("intent", intent),
            playbackLogField("reason", decision.reason.rawValue),
            appState,
            mediaCenterState,
            rate,
            playbackLogField("write", snapshot.mediaCenterWriteMode.rawValue),
            playbackLogField("susp", snapshot.systemSuspension.rawValue),
            playbackLogField("desired", snapshot.desiredTransport.rawValue),
            playbackLogField("render", snapshot.renderStatus.rawValue),
            playbackLogBoolField("isPlaying", snapshot.renderIsPlaying),
            playbackLogField("src", snapshot.currentStreamable?.identifier),
            playbackLogField("elapsed", snapshot.elapsed.map { String($0) }),
            playbackLogField("duration", snapshot.currentDuration.map { String($0) }),
            playbackLogField("sess", snapshot.currentSessionID),
            playbackLogIntegerField("gen", snapshot.generation)
        )
    }

    private func unsignedValue(_ value: Int64?) -> UInt64? {
        guard let value, value >= 0 else { return nil }
        return UInt64(value)
    }

    private func renderStatus(for phase: GaplessPlaybackPhase) -> MediaCenterRenderStatus {
        switch phase {
        case .stopped:
            return .stopped
        case .preparing:
            return .preparing
        case .paused:
            return .paused
        case .playing:
            return .playing
        case .failed:
            return .failed
        }
    }

    private func logStatusApplication(status: GaplessMP3PlayerStatus, snapshot: Snapshot) {
        let decision = resolvePresentationDecision(
            for: snapshot,
            now: ProcessInfo.processInfo.systemUptime
        )
        var mediaCenterState = playbackLogField("mc", nil)
        var rate = playbackLogField("rate", nil)
        if case .update(let update) = decision {
            mediaCenterState = playbackLogField("mc", update.mediaCenterPlaybackState.rawValue)
            rate = playbackLogField("rate", String(update.playbackRate))
        }

        backendStateLog.debug(
            "applied",
            "status",
            playbackLogField("phase", status.playbackPhase.rawValue),
            playbackLogBoolField("statusPlaying", status.isPlaying),
            playbackLogField("nativeSrc", status.currentSource?.id),
            playbackLogField("src", snapshot.currentStreamable?.identifier),
            playbackLogField("app", String(describing: snapshot.currentState)),
            mediaCenterState,
            rate,
            playbackLogIntegerField("gen", snapshot.generation)
        )
    }

    private func consumePendingStartTimeAfterPrepareOnQueue(for generation: UInt64) -> TimeInterval? {
        snapshotStore.withValue { snapshot in
            guard snapshot.generation == generation else {
                return nil
            }
            guard let pendingStartTimeAfterPrepare = snapshot.pendingStartTimeAfterPrepare,
                  pendingStartTimeAfterPrepare.generation == generation else {
                return nil
            }
            snapshot.pendingStartTimeAfterPrepare = nil
            return max(Double(pendingStartTimeAfterPrepare.milliseconds) / 1000, 0)
        }
    }

    private func updateSnapshotOnQueue(_ mutate: (inout Snapshot) -> Void) {
        let previous = snapshotStore.get()
        snapshotStore.withValue { snapshot in
            mutate(&snapshot)
        }
        applyPresentationAndEmit(previous: previous)
    }

    private func scheduleResumeGraceExpirationIfNeededOnQueue(for generation: UInt64) {
        backendQueue.asyncAfter(deadline: .now() + resumePresentationGraceInterval) { [weak self] in
            guard let self else { return }
            let previous = self.snapshotStore.get()
            guard previous.generation == generation,
                  previous.resumeStartedAtUptime != nil,
                  previous.desiredTransport == .playing,
                  previous.systemSuspension == .none else {
                return
            }
            // No renderer event may arrive exactly when grace expires. Reapply
            // the decision so app state can move from startup .Playing to
            // stalled/buffering while Media Center keeps desired-play semantics.
            self.applyPresentationAndEmit(previous: previous)
        }
    }

    private func startProgressPollingIfNeededOnQueue(for generation: UInt64) {
        guard !teardownRequested.get() else { return }

        let shouldSchedule = snapshotStore.withValue { snapshot -> Bool in
            guard snapshot.generation == generation,
                  shouldKeepProgressPolling(for: snapshot) else {
                return false
            }
            guard snapshot.progressPollingGeneration != generation else {
                return false
            }
            snapshot.progressPollingGeneration = generation
            return true
        }
        guard shouldSchedule else { return }

        backendLifecycleLog.debug(
            "started",
            "progress polling",
            playbackLogIntegerField("gen", generation)
        )
        scheduleProgressPollingTickOnQueue(for: generation)
    }

    private func scheduleProgressPollingTickOnQueue(for generation: UInt64) {
        backendQueue.asyncAfter(deadline: .now() + .milliseconds(250)) {
            self.refreshProgressPollingTickOnQueue(for: generation)
        }
    }

    private func refreshProgressPollingTickOnQueue(for generation: UInt64) {
        guard !teardownRequested.get() else { return }

        let snapshot = snapshotStore.get()
        guard snapshot.generation == generation,
              shouldKeepProgressPolling(for: snapshot),
              snapshot.progressPollingGeneration == generation else {
            if snapshot.progressPollingGeneration == generation {
                snapshotStore.withValue { $0.progressPollingGeneration = nil }
                backendLifecycleLog.debug(
                    "stopped",
                    "progress polling",
                    playbackLogIntegerField("gen", generation)
                )
            }
            return
        }

        Task { [weak self] in
            guard let self else { return }
            let status = await self.player.status()
            self.backendQueue.async {
                let current = self.snapshotStore.get()
                guard current.generation == generation,
                      self.shouldKeepProgressPolling(for: current),
                      current.progressPollingGeneration == generation else {
                    if current.progressPollingGeneration == generation {
                        self.snapshotStore.withValue { $0.progressPollingGeneration = nil }
                    }
                    return
                }

                self.applyStatus(status)
                if self.snapshotStore.get().progressPollingGeneration == generation {
                    self.scheduleProgressPollingTickOnQueue(for: generation)
                }
            }
        }
    }

    private func handleResumeRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        let snapshot = snapshotStore.get()
        logRemoteCommand("resume", result: snapshot.currentStreamable == nil ? .commandFailed : .success, snapshot: snapshot)
        guard snapshot.currentStreamable != nil else {
            return .commandFailed
        }
        emitRemoteControl("resume")
        backendQueue.async {
            self.resumeOnQueue()
        }
        return .success
    }

    private func handlePauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        logRemoteCommand("pause", result: .success, snapshot: snapshotStore.get())
        emitRemoteControl("pause")
        backendQueue.async {
            self.pauseOnQueue()
        }
        return .success
    }

    private func handleTogglePlayPauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        let snapshot = snapshotStore.get()
        logRemoteCommand("togglePlayPause", result: snapshot.currentStreamable == nil ? .commandFailed : .success, snapshot: snapshot)
        guard snapshot.currentStreamable != nil else {
            return .commandFailed
        }
        backendQueue.async {
            let shouldPause = self.shouldRemoteTogglePause(snapshot: self.snapshotStore.get())
            self.emitRemoteControl(shouldPause ? "pause" : "resume")
            if shouldPause {
                self.pauseOnQueue()
            } else {
                self.resumeOnQueue()
            }
        }
        return .success
    }

    private func handleSeekRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        guard let event = event as? MPChangePlaybackPositionCommandEvent, event.positionTime >= 0 else {
            return .commandFailed
        }
        let snapshot = snapshotStore.get()
        guard let acceptedTime = RemoteCommandSeekPolicy(
            hasCurrentTrack: snapshot.currentStreamable != nil,
            currentDuration: snapshot.currentDuration,
            requestedTime: event.positionTime
        ).acceptedTime else {
            logRemoteCommand("changePlaybackPosition", result: .commandFailed, snapshot: snapshot)
            return .commandFailed
        }

        logRemoteCommand("changePlaybackPosition", result: .success, snapshot: snapshot)
        backendQueue.async {
            self.seekToTimeOnQueue(Int64(acceptedTime * 1000))
        }
        return .success
    }

    private func handleNextTrackRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        logRemoteCommand("nextTrack", result: .success, snapshot: snapshotStore.get())
        emitRemoteControl("nextTrack")
        return .success
    }

    private func handlePreviousTrackRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        logRemoteCommand("prevTrack", result: .success, snapshot: snapshotStore.get())
        emitRemoteControl("prevTrack")
        return .success
    }

    private func shouldRemoteTogglePause(snapshot: Snapshot) -> Bool {
        snapshot.desiredTransport == .playing && snapshot.systemSuspension == .none
    }

    private func logRemoteCommand(
        _ method: String,
        result: MPRemoteCommandHandlerStatus,
        snapshot: Snapshot
    ) {
        backendCommandLog.info(
            "handled",
            "remote command",
            playbackLogField("method", method),
            playbackLogField("result", remoteCommandResultDescription(result)),
            playbackLogField("app", String(describing: snapshot.currentState)),
            playbackLogField("desired", snapshot.desiredTransport.rawValue),
            playbackLogField("susp", snapshot.systemSuspension.rawValue),
            playbackLogIntegerField("gen", snapshot.generation)
        )
    }

    private func remoteCommandResultDescription(_ result: MPRemoteCommandHandlerStatus) -> String {
        switch result {
        case .success:
            return "success"
        case .noSuchContent:
            return "noSuchContent"
        case .noActionableNowPlayingItem:
            return "noActionableNowPlayingItem"
        case .deviceNotFound:
            return "deviceNotFound"
        case .commandFailed:
            return "commandFailed"
        @unknown default:
            return "unknown"
        }
    }

    private func emitRemoteControl(_ method: String) {
        // Keep the policy centralized: next/prev still go to JS, but native-owned
        // play/pause commands stop here after the MPRemoteCommandCenter handler
        // has already updated the player.
        guard NativeRemoteControlForwardingPolicy.shouldForwardToJavaScript(method) else {
            return
        }
        delegateQueue.async {
            self.delegate?.remoteControl(method: method)
        }
    }

    private func emitStateIfNeeded(previous: PlaybackState, current: PlaybackState) {
        guard previous != current else { return }
        delegateQueue.async {
            self.delegate?.playbackStateChanged(newPlaybackState: current)
        }
    }

    private func emitProgressIfNeeded(previous: Snapshot, current: Snapshot) {
        guard previous.elapsed != current.elapsed || previous.currentDuration != current.currentDuration else { return }
        delegateQueue.async {
            self.delegate?.playbackProgressChanged(elapsed: current.elapsed, duration: current.currentDuration)
        }
    }

    private func emitDownloadProgressIfNeeded(previous: Snapshot, current: Snapshot) {
        guard previous.activeTrackDownloadedBytes != current.activeTrackDownloadedBytes ||
                previous.activeTrackTotalBytes != current.activeTrackTotalBytes else { return }
        guard let downloadedBytes = current.activeTrackDownloadedBytes,
              let totalBytes = current.activeTrackTotalBytes else { return }
        delegateQueue.async {
            self.delegate?.downloadProgressChanged(
                forActiveTrack: true,
                downloadedBytes: downloadedBytes,
                totalBytes: totalBytes
            )
        }
    }

    private func translateStreamingCacheCompletionIfNeeded(
        status: GaplessMP3PlayerStatus,
        snapshot: Snapshot
    ) {
        maybeEmitStreamingCacheCompletion(
            downloadStatus: status.currentSourceDownload,
            streamable: streamableMatching(id: status.currentSourceDownload?.source.id, snapshot: snapshot)
        )
        maybeEmitStreamingCacheCompletion(
            downloadStatus: status.nextSourceDownload,
            streamable: streamableMatching(id: status.nextSourceDownload?.source.id, snapshot: snapshot)
        )
    }

    private func maybeEmitStreamingCacheCompletion(
        downloadStatus: SourceDownloadStatus?,
        streamable: RelistenGaplessStreamable?
    ) {
        guard let downloadStatus, let streamable else { return }
        guard downloadStatus.state == .cached || downloadStatus.state == .completed else { return }
        guard let resolvedFileURL = downloadStatus.resolvedFileURL,
              let downloadDestination = streamable.downloadDestination else { return }
        guard resolvedFileURL != downloadDestination else { return }
        guard !FileManager.default.fileExists(atPath: downloadDestination.path) else { return }

        do {
            try FileManager.default.createDirectory(
                at: downloadDestination.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.copyItem(at: resolvedFileURL, to: downloadDestination)
            let attributes = try FileManager.default.attributesOfItem(atPath: downloadDestination.path)
            let bytesWritten = (attributes[.size] as? NSNumber)?.intValue ?? Int(downloadStatus.downloadedBytes)
            delegateQueue.async {
                self.delegate?.streamingCacheCompleted(
                    forStreamable: streamable,
                    bytesWritten: bytesWritten
                )
            }
        } catch {
            backendErrorLog.error(
                "failed",
                "streaming cache copy",
                playbackLogField("src", streamable.identifier),
                playbackLogPathField("fromPath", resolvedFileURL),
                playbackLogPathField("toPath", downloadDestination),
                playbackLogIntegerField("gen", snapshotStore.get().generation),
                playbackLogErrorField(String(describing: error))
            )
            emitError(error, for: streamable)
        }
    }

    private func emitError(_ error: Error, for streamable: RelistenGaplessStreamable) {
        guard let translated = translateError(error) else { return }
        backendErrorLog.error(
            "failed",
            "playback",
            playbackLogField("src", streamable.identifier),
            playbackLogField("sess", snapshotStore.get().currentSessionID),
            playbackLogIntegerField("gen", snapshotStore.get().generation),
            playbackLogErrorField(translated.description ?? translated.message)
        )
        delegateQueue.async {
            self.delegate?.errorStartingStream(error: translated, forStreamable: streamable)
        }
    }

    private func translateError(_ error: Error) -> PlaybackStreamError? {
        guard let failure = GaplessPlaybackFailure.make(from: error) else { return nil }
        return PlaybackStreamError(
            kind: PlaybackErrorKind(rawValue: failure.kind.rawValue) ?? .unknown,
            message: failure.message,
            description: failure.description,
            isRetryable: failure.isRetryable,
            platform: "ios",
            platformCode: failure.platformCode,
            platformName: failure.platformName,
            httpStatus: failure.httpStatus
        )
    }

    private func handleRouteChangeOnQueue(_ event: RouteChangeEvent) {
        let snapshot = snapshotStore.get()
        backendStateLog.info(
            "received",
            "route change",
            playbackLogField("reason", routeChangeReasonDescription(event.reason)),
            playbackLogField("prevOutputs", routeOutputsDescription(event.previousOutputs)),
            playbackLogField("currentOutputs", routeOutputsDescription(event.currentOutputs)),
            playbackLogField("app", String(describing: snapshot.currentState)),
            playbackLogField("desired", snapshot.desiredTransport.rawValue),
            playbackLogIntegerField("gen", snapshot.generation)
        )

        guard event.reason == .oldDeviceUnavailable else {
            refreshStatusOnQueue(for: snapshot.generation)
            return
        }

        guard snapshot.currentState == .Playing ||
                snapshot.currentState == .Stalled ||
                snapshot.desiredTransport == .playing else {
            return
        }

        player.pause()
        updateSnapshotOnQueue {
            $0.desiredTransport = .paused
            $0.systemSuspension = .none
            $0.mediaCenterWriteMode = .active
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .paused
            $0.renderIsPlaying = false
            $0.currentState = .Paused
        }
        refreshStatusOnQueue(for: snapshotStore.get().generation)
    }

    private func handleInterruptionOnQueue(_ event: AudioInterruptionEvent) {
        let snapshot = snapshotStore.get()
        secondaryAudioSilenceHintActive = event.secondaryAudioShouldBeSilenced
        backendStateLog.info(
            "received",
            "audio interruption",
            playbackLogField("type", interruptionTypeDescription(event.type)),
            playbackLogField("options", interruptionOptionsDescription(event.options)),
            playbackLogField("reason", event.reason.map(interruptionReasonDescription)),
            playbackLogBoolField("shouldResume", event.options.contains(.shouldResume)),
            playbackLogBoolField("secondarySilenced", event.secondaryAudioShouldBeSilenced),
            playbackLogField("app", String(describing: snapshot.currentState)),
            playbackLogField("desired", snapshot.desiredTransport.rawValue),
            playbackLogField("write", snapshot.mediaCenterWriteMode.rawValue),
            playbackLogIntegerField("gen", snapshot.generation)
        )

        switch event.type {
        case .began:
            handleInterruptionBeganOnQueue(event)
        case .ended:
            handleInterruptionEndedOnQueue(event)
        @unknown default:
            break
        }
    }

    private func handleInterruptionBeganOnQueue(_ event: AudioInterruptionEvent) {
        let previous = snapshotStore.get()
        wasPlayingWhenInterrupted = previous.desiredTransport == .playing ||
            previous.currentState == .Playing ||
            previous.currentState == .Stalled
        player.pause()
        snapshotStore.withValue {
            // Do not turn a system interruption into user intent. Desired
            // transport stays as-is so an ended interruption can resume only
            // when iOS grants .shouldResume and the user has not paused.
            $0.systemSuspension = .temporaryInterruption
            $0.mediaCenterWriteMode = .active
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .paused
            $0.renderIsPlaying = false
        }
        let current = applyPresentationAndEmit(previous: previous, freezeAfterUpdate: true)
        snapshotStore.withValue {
            // After the final interrupted snapshot, freeze subsequent writes
            // while classification is ambiguous. A phone call can later resume;
            // Spotify/external media can later suppress and clear.
            guard $0.generation == current.generation,
                  $0.systemSuspension == .temporaryInterruption,
                  $0.mediaCenterWriteMode == .active else {
                return
            }
            $0.mediaCenterWriteMode = .frozen
        }
    }

    private func handleInterruptionEndedOnQueue(_ event: AudioInterruptionEvent) {
        let snapshot = snapshotStore.get()
        let shouldResume = event.options.contains(.shouldResume)
        let wasInterruptedPlaying = wasPlayingWhenInterrupted
        let shouldAutoResume = shouldResume &&
            wasInterruptedPlaying &&
            snapshot.desiredTransport == .playing &&
            snapshot.systemSuspension != .externalMedia &&
            !event.secondaryAudioShouldBeSilenced &&
            !secondaryAudioSilenceHintActive
        wasPlayingWhenInterrupted = false

        if shouldAutoResume {
            // iOS explicitly allowed resume and the user still wants playback,
            // so unfreeze writes before going through the normal resume path.
            snapshotStore.withValue {
                $0.systemSuspension = .none
                $0.mediaCenterWriteMode = .active
            }
            resumeOnQueue()
            return
        }

        if snapshot.systemSuspension == .externalMedia ||
            snapshot.mediaCenterWriteMode == .suppressed ||
            event.secondaryAudioShouldBeSilenced ||
            secondaryAudioSilenceHintActive ||
            (!shouldResume && wasInterruptedPlaying && snapshot.desiredTransport == .playing) {
            // No-resume for a previously playing session is treated as yielding
            // rather than user pause. That lets Spotify or another primary app
            // replace Relisten on the lock screen.
            suppressForExternalMediaOnQueue(reason: "interruptionEnded")
            return
        }

        player.pause()
        updateSnapshotOnQueue {
            $0.desiredTransport = .paused
            $0.systemSuspension = .none
            $0.mediaCenterWriteMode = .active
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .paused
            $0.renderIsPlaying = false
            $0.currentState = .Paused
        }
    }

    private func handleSilenceSecondaryAudioHintOnQueue(_ event: SilenceSecondaryAudioHintEvent) {
        secondaryAudioSilenceHintActive = event.secondaryAudioShouldBeSilenced
        let snapshot = snapshotStore.get()
        backendStateLog.info(
            "received",
            "silence secondary audio hint",
            playbackLogField("type", silenceHintTypeDescription(event.type)),
            playbackLogBoolField("secondarySilenced", event.secondaryAudioShouldBeSilenced),
            playbackLogField("write", snapshot.mediaCenterWriteMode.rawValue),
            playbackLogField("desired", snapshot.desiredTransport.rawValue),
            playbackLogIntegerField("gen", snapshot.generation)
        )

        switch event.type {
        case .begin:
            if snapshot.systemSuspension == .temporaryInterruption ||
                snapshot.currentState != .Playing ||
                !snapshot.renderIsPlaying {
                // A silence hint while interrupted or not actively rendering is
                // strong evidence another primary app has taken over.
                suppressForExternalMediaOnQueue(reason: "silenceHintBegin")
            }
        case .end:
            break
        @unknown default:
            break
        }
    }

    private func suppressForExternalMediaOnQueue(reason: String) {
        let previous = snapshotStore.get()
        backendStateLog.info(
            "suppressed",
            "external media presentation",
            playbackLogField("reason", reason),
            playbackLogField("src", previous.currentStreamable?.identifier),
            playbackLogIntegerField("gen", previous.generation)
        )
        player.pause()
        snapshotStore.withValue {
            // Keep current metadata in memory for an explicit Relisten resume,
            // but suppress all Media Center writes so another app can own the
            // lock screen without polling/artwork resurrecting us.
            $0.desiredTransport = .paused
            $0.systemSuspension = .externalMedia
            $0.mediaCenterWriteMode = .suppressed
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .paused
            $0.renderIsPlaying = false
            if $0.currentState != .Stopped {
                $0.currentState = .Paused
            }
            $0.progressPollingGeneration = nil
        }
        applyPresentationAndEmit(previous: previous)
    }

    private func handleMediaServicesOnQueue(_ kind: AudioMediaServicesEventKind) {
        backendStateLog.warn(
            "received",
            "media services notification",
            playbackLogField("kind", kind.rawValue),
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )

        switch kind {
        case .lost:
            handleMediaServicesLostOnQueue()
        case .reset:
            handleMediaServicesResetOnQueue()
        }
    }

    private func handleMediaServicesLostOnQueue() {
        let previous = snapshotStore.get()
        guard !shouldIgnoreStatus(for: previous) else {
            // If another app already owns Media Center, a system reset/loss must
            // not make Relisten visible again just because we reinstall handlers.
            applyPresentationAndEmit(previous: previous)
            return
        }
        guard previous.currentStreamable != nil else {
            updateSnapshotOnQueue {
                $0.desiredTransport = .stopped
                $0.systemSuspension = .none
                $0.mediaCenterWriteMode = .active
                $0.resumeStartedAtUptime = nil
                $0.renderStatus = .stopped
                $0.renderIsPlaying = false
                $0.currentState = .Stopped
            }
            return
        }

        player.pause()
        snapshotStore.withValue {
            // Media services loss invalidates the renderer underneath us. Keep
            // Relisten visible as interrupted only when we still own playback.
            $0.systemSuspension = .temporaryInterruption
            $0.mediaCenterWriteMode = .active
            $0.resumeStartedAtUptime = nil
            $0.renderStatus = .failed
            $0.renderIsPlaying = false
        }
        applyPresentationAndEmit(previous: previous)
    }

    private func handleMediaServicesResetOnQueue() {
        let snapshot = snapshotStore.get()
        guard !teardownRequested.get() else { return }
        guard !shouldIgnoreStatus(for: snapshot) else {
            // Reinstall observers after reset, but preserve yielded ownership.
            // Explicit Relisten play/resume is the only path back to active.
            hasInstalledAudioSessionHandlers = false
            installAudioSessionHandlersIfNeededOnQueue()
            applyPresentationAndEmit(previous: snapshot)
            return
        }
        guard let currentStreamable = snapshot.currentStreamable else {
            updateSnapshotOnQueue {
                $0.desiredTransport = .stopped
                $0.systemSuspension = .none
                $0.mediaCenterWriteMode = .active
                $0.resumeStartedAtUptime = nil
                $0.renderStatus = .stopped
                $0.renderIsPlaying = false
                $0.currentState = .Stopped
            }
            return
        }

        hasInstalledAudioSessionHandlers = false
        installAudioSessionHandlersIfNeededOnQueue()

        let nextStreamable = snapshot.desiredNextStreamable ?? snapshot.nextStreamable
        let shouldResume = snapshot.desiredTransport == .playing && snapshot.systemSuspension != .externalMedia
        let resumeTime = snapshot.elapsed ?? 0
        let previous = snapshot
        let (generation, sessionID) = snapshotStore.withValue { snapshot in
            // Reset rebuilds the native graph around the current metadata. The
            // first presentation remains interrupted/stalled; only after prepare
            // succeeds do we clear suspension and possibly resume.
            let sessionID = UUID().uuidString
            snapshot.generation += 1
            snapshot.seekSequence = 0
            snapshot.currentSessionID = sessionID
            snapshot.systemSuspension = .temporaryInterruption
            snapshot.mediaCenterWriteMode = .active
            snapshot.resumeStartedAtUptime = nil
            snapshot.renderStatus = .preparing
            snapshot.renderIsPlaying = false
            snapshot.nextStreamable = nextStreamable
            snapshot.desiredNextStreamable = nextStreamable
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.pendingStartTimeAfterPrepare = resumeTime > 0
                ? PendingStartTimeAfterPrepare(
                    generation: snapshot.generation,
                    milliseconds: Int64(resumeTime * 1000)
                )
                : nil
            snapshot.isPreparingCurrentTrack = true
            return (snapshot.generation, sessionID)
        }
        player.sessionID = sessionID
        applyPresentationAndEmit(previous: previous)

        Task { [weak self] in
            guard let self else { return }

            do {
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try self.audioSessionController.configurePlaybackSession(shouldActivate: true)
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                await self.player.stop()
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try await self.player.prepare(
                    current: self.makePlaybackSource(from: currentStreamable),
                    next: nextStreamable.map(self.makePlaybackSource(from:))
                )
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                if let seekTime = self.consumePendingStartTimeAfterPrepareOnQueue(for: generation), seekTime > 0 {
                    try await self.player.seek(to: seekTime)
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                }
                if shouldResume && self.snapshotStore.get().desiredTransport == .playing {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    _ = self.player.play()
                }

                let status = await self.player.status()
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    self.snapshotStore.withValue {
                        $0.isPreparingCurrentTrack = false
                        if shouldResume,
                           $0.desiredTransport == .playing,
                           $0.systemSuspension != .externalMedia {
                            // Re-enter normal startup semantics only after the
                            // graph is prepared again; otherwise reset would
                            // pretend playback resumed before it can.
                            $0.systemSuspension = .none
                            $0.mediaCenterWriteMode = .active
                            $0.resumeStartedAtUptime = ProcessInfo.processInfo.systemUptime
                        } else if $0.systemSuspension == .temporaryInterruption {
                            $0.systemSuspension = .none
                            $0.mediaCenterWriteMode = .active
                            $0.resumeStartedAtUptime = nil
                        }
                    }
                    self.applyStatus(status)
                    if shouldResume {
                        self.scheduleResumeGraceExpirationIfNeededOnQueue(for: generation)
                    }
                    self.applyLatestDesiredNextIfNeededOnQueue(for: generation)
                }
            } catch {
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    let previous = self.snapshotStore.get()
                    self.snapshotStore.withValue {
                        $0.desiredTransport = .stopped
                        $0.systemSuspension = .none
                        $0.mediaCenterWriteMode = .active
                        $0.resumeStartedAtUptime = nil
                        $0.renderStatus = .failed
                        $0.renderIsPlaying = false
                        $0.isPreparingCurrentTrack = false
                        $0.pendingStartTimeAfterPrepare = nil
                        $0.currentState = .Stopped
                        $0.currentStreamable = nil
                        $0.nextStreamable = nil
                        $0.desiredNextStreamable = nil
                        $0.currentDuration = nil
                        $0.elapsed = nil
                        $0.activeTrackDownloadedBytes = nil
                        $0.activeTrackTotalBytes = nil
                        $0.progressPollingGeneration = nil
                    }
                    self.applyPresentationAndEmit(previous: previous)
                    self.emitError(error, for: currentStreamable)
                }
            }
        }
    }

    private func routeOutputsDescription(_ outputs: [AudioRouteOutput]) -> String {
        guard !outputs.isEmpty else { return "none" }
        return outputs
            .map { "\($0.portType):\($0.portName):\($0.uid)" }
            .joined(separator: ",")
    }

    private func routeChangeReasonDescription(_ reason: AVAudioSession.RouteChangeReason) -> String {
        switch reason {
        case .unknown:
            return "unknown"
        case .newDeviceAvailable:
            return "newDeviceAvailable"
        case .oldDeviceUnavailable:
            return "oldDeviceUnavailable"
        case .categoryChange:
            return "categoryChange"
        case .override:
            return "override"
        case .wakeFromSleep:
            return "wakeFromSleep"
        case .noSuitableRouteForCategory:
            return "noSuitableRouteForCategory"
        case .routeConfigurationChange:
            return "routeConfigurationChange"
        @unknown default:
            return "unknownDefault"
        }
    }

    private func interruptionTypeDescription(_ type: AVAudioSession.InterruptionType) -> String {
        switch type {
        case .began:
            return "began"
        case .ended:
            return "ended"
        @unknown default:
            return "unknownDefault"
        }
    }

    private func interruptionOptionsDescription(_ options: AVAudioSession.InterruptionOptions) -> String {
        var values: [String] = []
        if options.contains(.shouldResume) {
            values.append("shouldResume")
        }
        return values.isEmpty ? "none" : values.joined(separator: ",")
    }

    private func interruptionReasonDescription(_ reason: AVAudioSession.InterruptionReason) -> String {
        switch reason {
        case .default:
            return "default"
        case .appWasSuspended:
            return "appWasSuspended"
        case .builtInMicMuted:
            return "builtInMicMuted"
        case .routeDisconnected:
            return "routeDisconnected"
        @unknown default:
            return "unknownDefault"
        }
    }

    private func silenceHintTypeDescription(_ type: AVAudioSession.SilenceSecondaryAudioHintType) -> String {
        switch type {
        case .begin:
            return "begin"
        case .end:
            return "end"
        @unknown default:
            return "unknownDefault"
        }
    }

    private func shouldContinueAsyncWork(for generation: UInt64) -> Bool {
        guard !teardownRequested.get() else { return false }
        let currentGeneration = snapshotStore.get().generation
        let supersessionState = PlaySupersessionState(activeGeneration: currentGeneration)
        let shouldApply = supersessionState.prepareCompletionAction(for: generation) == .applyPreparedTrack
        if !shouldApply {
            backendLifecycleLog.debug(
                "discarding",
                "stale async result",
                playbackLogIntegerField("gen", generation),
                playbackLogIntegerField("currentGen", currentGeneration)
            )
        }
        return shouldApply
    }
}
