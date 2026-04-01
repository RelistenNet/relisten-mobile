import AVFAudio
import Foundation
import MediaPlayer

private let backendCommandLog = RelistenPlaybackLogger(layer: .backend, category: .command)
private let backendLifecycleLog = RelistenPlaybackLogger(layer: .backend, category: .lifecycle)
private let backendNetworkLog = RelistenPlaybackLogger(layer: .backend, category: .network)
private let backendStateLog = RelistenPlaybackLogger(layer: .backend, category: .state)
private let backendErrorLog = RelistenPlaybackLogger(layer: .backend, category: .error)

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
    private enum DesiredTransport {
        case playing
        case paused
        case stopped
    }

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
        var desiredTransport: DesiredTransport = .stopped
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
            onOldDeviceUnavailable: { [weak self] in
                self?.backendQueue.async {
                    self?.handleOldDeviceUnavailableOnQueue()
                }
            },
            onInterruptionBegan: { [weak self] in
                self?.backendQueue.async {
                    self?.handleInterruptionBeganOnQueue()
                }
            },
            onInterruptionEndedShouldResume: { [weak self] in
                self?.backendQueue.async {
                    self?.handleInterruptionEndedShouldResumeOnQueue()
                }
            },
            onMediaServicesReset: { [weak self] in
                self?.backendQueue.async {
                    self?.handleMediaServicesResetOnQueue()
                }
            },
            onMediaServicesLost: { [weak self] in
                self?.backendQueue.async {
                    self?.handleMediaServicesResetOnQueue()
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

        let previousState = snapshot.currentState
        let (generation, sessionID) = snapshotStore.withValue { snapshot in
            var supersessionState = PlaySupersessionState(activeGeneration: snapshot.generation)
            let generation = supersessionState.beginPlayRequest()
            let sessionID = UUID().uuidString
            snapshot.generation = generation
            snapshot.seekSequence = 0
            snapshot.currentSessionID = sessionID
            snapshot.desiredTransport = .playing
            snapshot.currentStreamable = streamable
            snapshot.nextStreamable = nil
            snapshot.desiredNextStreamable = nil
            snapshot.currentState = .Stalled
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
        playbackPresentationController.setPlaybackState(.Stalled)
        emitStateIfNeeded(previous: previousState, current: .Stalled)
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
                    self.snapshotStore.withValue {
                        $0.currentStreamable = nil
                        $0.nextStreamable = nil
                        $0.desiredNextStreamable = nil
                        $0.activeTrackDownloadedBytes = nil
                        $0.activeTrackTotalBytes = nil
                        $0.isPreparingCurrentTrack = false
                        $0.pendingStartTimeAfterPrepare = nil
                        $0.currentState = .Stopped
                    }
                    self.playbackPresentationController.clearNowPlaying()
                    self.playbackPresentationController.setPlaybackState(.Stopped)
                    self.emitStateIfNeeded(previous: .Stalled, current: .Stopped)
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
        snapshotStore.withValue { $0.desiredTransport = .playing }
        ResumeCommandState(
            isStopped: snapshotStore.get().currentState == .Stopped
        ).perform(
            prepareAudioSession: { self.prepareAudioSessionOnQueue(shouldActivate: true) },
            play: { self.player.play() },
            updateStateToPlaying: {
                self.updateSnapshotOnQueue {
                    $0.currentState = .Playing
                }
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
            guard $0.currentState != .Stopped else { return }
            $0.currentState = .Paused
            $0.progressPollingGeneration = nil
        }
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
        let previousState = snapshotStore.withValue { snapshot -> PlaybackState in
            let previousState = snapshot.currentState
            if shouldInvalidateGeneration {
                snapshot.generation += 1
                snapshot.seekSequence = 0
            }
            snapshot.currentSessionID = nil
            snapshot.desiredTransport = .stopped
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
            return previousState
        }
        let current = snapshotStore.get()
        player.sessionID = nil
        playbackPresentationController.clearNowPlaying()
        playbackPresentationController.setPlaybackState(.Stopped)
        emitStateIfNeeded(previous: previousState, current: .Stopped)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
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
            self.emitProgressIfNeeded(previous: previous, current: self.snapshotStore.get())
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
                guard self.snapshotStore.get().generation == generation else { return }
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
        let currentStreamable = streamableMatching(id: status.currentSource?.id, snapshot: previous) ?? previous.currentStreamable
        let nextStreamable = streamableMatching(id: status.nextSource?.id, snapshot: previous) ?? previous.nextStreamable
        let translatedState = playbackState(for: status.playbackPhase)
        let downloadedBytes = unsignedValue(status.currentSourceDownload?.downloadedBytes)
        let totalBytes = unsignedValue(status.currentSourceDownload?.expectedBytes)

        snapshotStore.withValue { snapshot in
            snapshot.currentDuration = status.duration
            snapshot.elapsed = status.currentTime
            snapshot.currentState = translatedState
            snapshot.currentStreamable = status.currentSource == nil ? nil : currentStreamable
            snapshot.nextStreamable = status.nextSource == nil ? nil : nextStreamable
            snapshot.activeTrackDownloadedBytes = downloadedBytes
            snapshot.activeTrackTotalBytes = totalBytes
            snapshot.isPreparingCurrentTrack = status.playbackPhase == .preparing
            if translatedState == .Paused || translatedState == .Stopped || status.currentSource == nil {
                snapshot.progressPollingGeneration = nil
            }
        }

        let current = snapshotStore.get()
        syncNowPlaying(with: current)
        playbackPresentationController.setPlaybackState(translatedState)
        emitStateIfNeeded(previous: previous.currentState, current: translatedState)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
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
            if let currentStreamable = snapshotStore.get().currentStreamable {
                emitError(failure, for: currentStreamable)
            }
        case .networkRetrying:
            break
        case .trackTransitioned(let previous, let current, _):
            let snapshot = snapshotStore.get()
            let previousStreamable = streamableMatching(id: previous?.id, snapshot: snapshot) ?? snapshot.currentStreamable
            let currentStreamable = streamableMatching(id: current?.id, snapshot: snapshot) ?? snapshot.nextStreamable
            backendStateLog.info(
                "committed",
                "track transition",
                playbackLogField("prev", previousStreamable?.identifier),
                playbackLogField("next", currentStreamable?.identifier),
                playbackLogField("sess", eventSessionID),
                playbackLogIntegerField("gen", snapshot.generation)
            )
            snapshotStore.withValue {
                $0.currentStreamable = currentStreamable
                $0.nextStreamable = nil
                $0.desiredNextStreamable = nil
            }
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
            let previousState = snapshotStore.withValue { snapshot -> PlaybackState in
                let previousState = snapshot.currentState
                snapshot.generation += 1
                snapshot.seekSequence = 0
                snapshot.currentSessionID = nil
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
                return previousState
            }
            let current = snapshotStore.get()
            player.sessionID = nil
            playbackPresentationController.clearNowPlaying()
            playbackPresentationController.setPlaybackState(.Stopped)
            emitStateIfNeeded(previous: previousState, current: .Stopped)
            emitProgressIfNeeded(previous: snapshot, current: current)
            emitDownloadProgressIfNeeded(previous: snapshot, current: current)
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

    private func playbackState(for phase: GaplessPlaybackPhase) -> PlaybackState {
        switch phase {
        case .playing:
            return .Playing
        case .paused:
            return .Paused
        case .preparing:
            return .Stalled
        case .stopped, .failed:
            return .Stopped
        }
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

        switch snapshot.currentState {
        case .Playing, .Stalled:
            return true
        case .Paused, .Stopped:
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

    private func unsignedValue(_ value: Int64?) -> UInt64? {
        guard let value, value >= 0 else { return nil }
        return UInt64(value)
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
        let current = snapshotStore.get()
        syncNowPlaying(with: current)
        playbackPresentationController.setPlaybackState(current.currentState)
        emitStateIfNeeded(previous: previous.currentState, current: current.currentState)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
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
        emitRemoteControl("resume")
        backendQueue.async {
            self.resumeOnQueue()
        }
        return .success
    }

    private func handlePauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        emitRemoteControl("pause")
        backendQueue.async {
            self.pauseOnQueue()
        }
        return .success
    }

    private func handleTogglePlayPauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        backendQueue.async {
            let shouldPause = self.snapshotStore.get().currentState == .Playing
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

        backendQueue.async {
            self.seekToTimeOnQueue(Int64(event.positionTime * 1000))
        }
        return .success
    }

    private func handleNextTrackRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        emitRemoteControl("nextTrack")
        return .success
    }

    private func handlePreviousTrackRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        emitRemoteControl("prevTrack")
        return .success
    }

    private func emitRemoteControl(_ method: String) {
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

    private func handleOldDeviceUnavailableOnQueue() {
        let state = snapshotStore.get().currentState
        guard state == .Playing || state == .Stalled else { return }
        pauseOnQueue()
    }

    private func handleInterruptionBeganOnQueue() {
        let state = snapshotStore.get().currentState
        wasPlayingWhenInterrupted = state == .Playing || state == .Stalled
        pauseOnQueue()
    }

    private func handleInterruptionEndedShouldResumeOnQueue() {
        guard wasPlayingWhenInterrupted else { return }
        wasPlayingWhenInterrupted = false
        resumeOnQueue()
    }

    private func handleMediaServicesResetOnQueue() {
        let snapshot = snapshotStore.get()
        guard !teardownRequested.get() else { return }
        guard let currentStreamable = snapshot.currentStreamable else { return }

        hasInstalledAudioSessionHandlers = false
        installAudioSessionHandlersIfNeededOnQueue()

        let nextStreamable = snapshot.desiredNextStreamable ?? snapshot.nextStreamable
        let shouldResume = snapshot.currentState == .Playing || snapshot.currentState == .Stalled
        let resumeTime = snapshot.elapsed ?? 0
        let previousState = snapshot.currentState
        let (generation, sessionID) = snapshotStore.withValue { snapshot in
            let sessionID = UUID().uuidString
            snapshot.generation += 1
            snapshot.seekSequence = 0
            snapshot.currentSessionID = sessionID
            snapshot.currentState = .Stalled
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
        playbackPresentationController.setPlaybackState(.Stalled)
        emitStateIfNeeded(previous: previousState, current: .Stalled)

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
                    self.snapshotStore.withValue { $0.isPreparingCurrentTrack = false }
                    self.applyStatus(status)
                    self.applyLatestDesiredNextIfNeededOnQueue(for: generation)
                }
            } catch {
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    self.snapshotStore.withValue {
                        $0.isPreparingCurrentTrack = false
                        $0.pendingStartTimeAfterPrepare = nil
                        $0.currentState = .Stopped
                    }
                    self.playbackPresentationController.clearNowPlaying()
                    self.playbackPresentationController.setPlaybackState(.Stopped)
                    self.emitStateIfNeeded(previous: .Stalled, current: .Stopped)
                    self.emitError(error, for: currentStreamable)
                }
            }
        }
    }

    private func syncNowPlaying(with snapshot: Snapshot) {
        guard let streamable = snapshot.currentStreamable, snapshot.currentState != .Stopped else {
            playbackPresentationController.clearNowPlaying()
            return
        }

        playbackPresentationController.updateNowPlaying(
            title: streamable.title,
            artist: streamable.artist,
            album: streamable.albumTitle,
            duration: snapshot.currentDuration,
            elapsed: snapshot.elapsed,
            rate: playbackRate(for: snapshot.currentState),
            artworkURL: URL(string: streamable.albumArt)
        )
    }

    private func playbackRate(for playbackState: PlaybackState) -> Float {
        playbackState == .Playing ? 1.0 : 0.0
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
