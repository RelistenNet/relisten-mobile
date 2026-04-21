import AVFAudio
import Foundation
import MediaPlayer

// This file owns the PlaybackBackend entry points and native player command
// sequencing. Supporting files under ios/Backend own the state model, Media
// Center presentation, remote commands, audio-session events, runtime events,
// status/progress polling, and delegate emission.
//
// Mutable backend state is either confined to backendQueue/delegateQueue or protected by BackendLockedValue.
final class GaplessMP3PlayerBackend: PlaybackBackend, @unchecked Sendable {
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

    let backendQueue = DispatchQueue(label: "net.relisten.ios.native-backend-queue", qos: .userInteractive)
    let delegateQueue = DispatchQueue(label: "net.relisten.ios.native-backend-delegate-queue", qos: .userInteractive)
    let snapshotStore = BackendLockedValue(GaplessBackendSnapshot())
    let teardownRequested = BackendLockedValue(false)
    let backendInstanceID = UUID().uuidString
    let player: GaplessMP3Player
    let audioSessionController = AudioSessionController()
    let presentationCoordinator = GaplessBackendPresentationCoordinator()
    var wasPlayingWhenInterrupted = false
    var secondaryAudioSilenceHintActive = AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint
    var hasInstalledAudioSessionHandlers = false
    var hasReportedAudioSessionSetup = false
    lazy var remoteCommandController = GaplessBackendRemoteCommandController(
        snapshotStore: snapshotStore,
        backendQueue: backendQueue,
        emitRemoteControl: { [weak self] method in
            self?.emitRemoteControl(method)
        },
        resumeOnQueue: { [weak self] in
            self?.resumeOnQueue()
        },
        pauseOnQueue: { [weak self] in
            self?.pauseOnQueue()
        },
        seekToTimeOnQueue: { [weak self] timeMs in
            self?.seekToTimeOnQueue(timeMs)
        }
    )

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
            self.presentationCoordinator.teardown()
        }
    }

    private func playOnQueue(
        _ streamable: RelistenGaplessStreamable,
        startingAtMs: Int64?,
        manualTrackChange: GaplessBackendManualTrackChange? = nil
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
                    $0.pendingStartTimeAfterPrepare = GaplessBackendPendingStartTimeAfterPrepare(
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
            snapshot.presentation.beginPlayback(now: ProcessInfo.processInfo.systemUptime)
            snapshot.currentStreamable = streamable
            snapshot.nextStreamable = nil
            snapshot.desiredNextStreamable = nil
            snapshot.currentDuration = nil
            snapshot.elapsed = nil
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.pendingStartTimeAfterPrepare = startingAtMs.map {
                GaplessBackendPendingStartTimeAfterPrepare(
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
                        $0.presentation.stop(renderStatus: .failed)
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

    func setNextOnQueue(_ streamable: RelistenGaplessStreamable?) {
        backendCommandLog.debug(
            "entered",
            "setNext command",
            playbackLogField("next", streamable?.identifier),
            playbackLogIntegerField("gen", snapshotStore.get().generation)
        )
        let (snapshot, requestAction) = snapshotStore.withValue { snapshot -> (GaplessBackendSnapshot, NextStreamSupersessionRequestAction) in
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

    func resumeOnQueue() {
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
                    $0.presentation.beginPlayback(
                        now: ProcessInfo.processInfo.systemUptime,
                        renderStatus: .paused
                    )
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
            $0.presentation.pause()
            guard $0.currentState != .Stopped else { return }
            $0.currentState = .Paused
        }
        refreshStatusOnQueue(for: snapshotStore.get().generation)
    }

    func stopOnQueue(
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
            snapshot.presentation.stop()
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
        let (snapshot, nextAction) = snapshotStore.withValue { snapshot -> (GaplessBackendSnapshot, NextCommandAction) in
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
            manualTrackChange: GaplessBackendManualTrackChange(previous: snapshot.currentStreamable, current: nextStreamable)
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
                if snapshot.desiredTransport == .playing {
                    snapshot.presentation.beginSeekRestart(
                        now: ProcessInfo.processInfo.systemUptime,
                        seekSequence: snapshot.seekSequence
                    )
                }
            }
            self.applyPresentationAndEmit(previous: previous)
        }) else { return }
        scheduleSeekGraceExpirationIfNeededOnQueue(
            for: execution.generation,
            seekSequence: execution.seekSequence
        )

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

    func shouldContinueAsyncWork(for generation: UInt64) -> Bool {
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
