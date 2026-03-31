import AVFAudio
import Foundation
import MediaPlayer

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

final class GaplessMP3PlayerBackend: PlaybackBackend {
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
        var generation: UInt64 = 0
        var isPreparingCurrentTrack = false
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
    private let player: GaplessMP3Player
    private let audioSessionController = AudioSessionController()
    private let playbackPresentationController = PlaybackPresentationController()
    private var wasPlayingWhenInterrupted = false
    private var hasInstalledAudioSessionHandlers = false
    private var hasReportedAudioSessionSetup = false

    init(player: GaplessMP3Player = GaplessMP3Player()) {
        self.player = player

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
            self.stopOnQueue(emitTrackChanged: false)
            self.hasInstalledAudioSessionHandlers = false
            self.hasReportedAudioSessionSetup = false
            self.audioSessionController.teardown()
            self.playbackPresentationController.teardown()
        }
    }

    private func prepareAudioSessionOnQueue() {
        prepareAudioSessionOnQueue(shouldActivate: !AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint)
    }

    private func prepareAudioSessionOnQueue(shouldActivate: Bool) {
        guard !teardownRequested.get() else { return }

        do {
            try audioSessionController.configurePlaybackSession(shouldActivate: shouldActivate)
            installAudioSessionHandlersIfNeededOnQueue()
        } catch {
            NSLog("[relisten-audio-player][native-backend] failed to prepare audio session: \(error)")
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
        delegateQueue.async {
            self.delegate?.audioSessionWasSetup()
        }
    }

    private func playOnQueue(
        _ streamable: RelistenGaplessStreamable,
        startingAtMs: Int64?,
        manualTrackChange: (previous: RelistenGaplessStreamable?, current: RelistenGaplessStreamable?)? = nil
    ) {
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
            seekToTimeOnQueue(startingAtMs)
            return
        }

        let desiredNext = snapshot.desiredNextStreamable?.identifier == streamable.identifier ? nil : snapshot.desiredNextStreamable
        let previousState = snapshot.currentState
        let generation = snapshotStore.withValue { snapshot in
            snapshot.generation += 1
            snapshot.currentStreamable = streamable
            snapshot.nextStreamable = desiredNext
            snapshot.currentState = .Stalled
            snapshot.currentDuration = nil
            snapshot.elapsed = nil
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.isPreparingCurrentTrack = true
            return snapshot.generation
        }
        playbackPresentationController.setPlaybackState(.Stalled)
        emitStateIfNeeded(previous: previousState, current: .Stalled)

        let currentSource = makePlaybackSource(from: streamable)
        let nextSource = desiredNext.map(makePlaybackSource(from:))
        let seekTime = startingAtMs.map { max(Double($0) / 1000, 0) }

        Task { [weak self] in
            guard let self else { return }
            do {
                await self.player.stop()
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try await self.player.prepare(current: currentSource, next: nextSource)
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                if let seekTime, seekTime > 0 {
                    try await self.player.seek(to: seekTime)
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                }

                guard self.shouldContinueAsyncWork(for: generation) else { return }
                _ = self.player.play()
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
                        $0.isPreparingCurrentTrack = false
                        $0.currentState = .Stopped
                    }
                    self.playbackPresentationController.setPlaybackState(.Stopped)
                    self.emitStateIfNeeded(previous: .Stalled, current: .Stopped)
                    self.emitError(error, for: streamable)
                }
            }
        }
    }

    private func setNextOnQueue(_ streamable: RelistenGaplessStreamable?) {
        let snapshot = snapshotStore.withValue { snapshot -> Snapshot in
            snapshot.desiredNextStreamable = streamable
            if snapshot.currentStreamable == nil {
                snapshot.nextStreamable = streamable
            }
            return snapshot
        }

        guard snapshot.currentStreamable != nil else { return }
        guard !snapshot.isPreparingCurrentTrack else { return }

        let generation = snapshot.generation
        Task { [weak self] in
            guard let self else { return }
            do {
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
        guard snapshotStore.get().currentState != .Stopped else { return }
        prepareAudioSessionOnQueue(shouldActivate: true)
        guard player.play() else { return }
        updateSnapshotOnQueue {
            $0.currentState = .Playing
        }
    }

    private func pauseOnQueue() {
        player.pause()
        updateSnapshotOnQueue {
            guard $0.currentState != .Stopped else { return }
            $0.currentState = .Paused
        }
    }

    private func stopOnQueue(emitTrackChanged: Bool) {
        let previousStreamable = snapshotStore.get().currentStreamable
        let previousState = snapshotStore.withValue { snapshot -> PlaybackState in
            let previousState = snapshot.currentState
            snapshot.generation += 1
            snapshot.currentStreamable = nil
            snapshot.nextStreamable = nil
            snapshot.desiredNextStreamable = nil
            snapshot.currentDuration = nil
            snapshot.elapsed = nil
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.currentState = .Stopped
            snapshot.isPreparingCurrentTrack = false
            return previousState
        }
        playbackPresentationController.setPlaybackState(.Stopped)
        emitStateIfNeeded(previous: previousState, current: .Stopped)
        if emitTrackChanged, let previousStreamable {
            delegateQueue.async {
                self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: nil)
            }
        }

        Task { [weak self] in
            await self?.player.stop()
        }
    }

    private func nextOnQueue() {
        let snapshot = snapshotStore.get()
        guard snapshot.currentStreamable != nil else { return }

        guard let nextStreamable = snapshot.nextStreamable ?? snapshot.desiredNextStreamable else {
            stopOnQueue(emitTrackChanged: true)
            return
        }

        snapshotStore.withValue {
            $0.desiredNextStreamable = nil
            $0.nextStreamable = nil
        }
        playOnQueue(
            nextStreamable,
            startingAtMs: nil,
            manualTrackChange: (previous: snapshot.currentStreamable, current: nextStreamable)
        )
    }

    private func seekToPercentOnQueue(_ percent: Double) {
        guard percent.isFinite else { return }
        let normalizedPercent = max(0, min(percent, 1))
        if normalizedPercent >= 1 {
            emitRemoteControl("nextTrack")
            return
        }

        guard let duration = snapshotStore.get().currentDuration else { return }
        seekOnQueue(to: duration * normalizedPercent)
    }

    private func seekToTimeOnQueue(_ timeMs: Int64) {
        guard snapshotStore.get().currentStreamable != nil else { return }
        seekOnQueue(to: max(Double(timeMs) / 1000, 0))
    }

    private func seekOnQueue(to time: TimeInterval) {
        let generation = snapshotStore.get().generation
        let previous = snapshotStore.get()
        let clampedTime = snapshotStore.withValue { snapshot -> TimeInterval in
            let maxDuration = snapshot.currentDuration ?? time
            let clampedTime = max(0, min(time, maxDuration))
            snapshot.elapsed = clampedTime
            return clampedTime
        }
        emitProgressIfNeeded(previous: previous, current: snapshotStore.get())
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.player.seek(to: clampedTime)
                let status = await self.player.status()
                self.backendQueue.async {
                    guard self.snapshotStore.get().generation == generation else { return }
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
        guard snapshot.desiredNextStreamable?.identifier != snapshot.nextStreamable?.identifier else { return }
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
        }

        playbackPresentationController.setPlaybackState(translatedState)
        emitStateIfNeeded(previous: previous.currentState, current: translatedState)
        emitProgressIfNeeded(previous: previous, current: snapshotStore.get())
        emitDownloadProgressIfNeeded(previous: previous, current: snapshotStore.get())
    }

    private func handleRuntimeEvent(_ event: GaplessRuntimeEvent) {
        guard !teardownRequested.get() else { return }
        switch event {
        case .playbackFailed(let description):
            if let currentStreamable = snapshotStore.get().currentStreamable {
                emitError(
                    NSError(
                        domain: "net.relisten.ios.relisten-audio-player",
                        code: numericCode(for: .Unknown),
                        userInfo: [NSLocalizedDescriptionKey: description]
                    ),
                    for: currentStreamable
                )
            }
        case .networkRetrying:
            break
        case .trackTransitioned(let previous, let current):
            let snapshot = snapshotStore.get()
            let previousStreamable = streamableMatching(id: previous?.id, snapshot: snapshot) ?? snapshot.currentStreamable
            let currentStreamable = streamableMatching(id: current?.id, snapshot: snapshot) ?? snapshot.nextStreamable
            snapshotStore.withValue {
                $0.currentStreamable = currentStreamable
                $0.nextStreamable = nil
            }
            delegateQueue.async {
                self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: currentStreamable)
            }
            refreshStatusOnQueue(for: snapshot.generation)
        case .playbackFinished(let last):
            let snapshot = snapshotStore.get()
            guard snapshot.currentStreamable?.identifier == last?.id else { return }
            let previousStreamable = snapshotStore.get().currentStreamable
            let previousState = snapshotStore.withValue { snapshot -> PlaybackState in
                let previousState = snapshot.currentState
                snapshot.generation += 1
                snapshot.currentState = .Stopped
                snapshot.currentStreamable = nil
                snapshot.nextStreamable = nil
                snapshot.desiredNextStreamable = nil
                snapshot.currentDuration = nil
                snapshot.elapsed = nil
                snapshot.activeTrackDownloadedBytes = nil
                snapshot.activeTrackTotalBytes = nil
                snapshot.isPreparingCurrentTrack = false
                return previousState
            }
            playbackPresentationController.setPlaybackState(.Stopped)
            emitStateIfNeeded(previous: previousState, current: .Stopped)
            if let previousStreamable {
                delegateQueue.async {
                    self.delegate?.trackChanged(previousStreamable: previousStreamable, currentStreamable: nil)
                }
            }
        }
    }

    private func handleHTTPLogEvent(_ event: GaplessHTTPLogEvent) {
        guard !teardownRequested.get() else { return }
        guard event.sourceID == snapshotStore.get().currentStreamable?.identifier else { return }
        backendQueue.async {
            let previous = self.snapshotStore.get()
            self.snapshotStore.withValue { snapshot in
                snapshot.activeTrackDownloadedBytes = self.unsignedValue(event.cumulativeBytes)
            }
            self.emitDownloadProgressIfNeeded(previous: previous, current: self.snapshotStore.get())
        }
    }

    private func makePlaybackSource(from streamable: RelistenGaplessStreamable) -> GaplessPlaybackSource {
        GaplessPlaybackSource(
            id: streamable.identifier,
            url: streamable.url,
            cacheKey: streamable.identifier,
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

    private func updateSnapshotOnQueue(_ mutate: (inout Snapshot) -> Void) {
        let previous = snapshotStore.get()
        snapshotStore.withValue { snapshot in
            mutate(&snapshot)
        }
        let current = snapshotStore.get()
        playbackPresentationController.setPlaybackState(current.currentState)
        emitStateIfNeeded(previous: previous.currentState, current: current.currentState)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
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

    private func emitError(_ error: Error, for streamable: RelistenGaplessStreamable) {
        let nsError = error as NSError
        let translated = translateErrorCode(error)
        let wrapped = NSError(
            domain: "net.relisten.ios.relisten-audio-player",
            code: numericCode(for: translated),
            userInfo: [NSLocalizedDescriptionKey: nsError.localizedDescription]
        )
        delegateQueue.async {
            self.delegate?.errorStartingStream(error: wrapped, forStreamable: streamable)
        }
    }

    private func translateErrorCode(_ error: Error) -> PlaybackStreamError {
        if let error = error as? GaplessMP3PlayerError {
            switch error {
            case .unsupportedSourceScheme:
                return .InvalidUrl
            case .invalidMP3:
                return .FileInvalidFormat
            case .unsupportedFormat:
                return .UnsupportedSampleFormat
            case .sourceNotPrepared, .missingCurrentSource, .incompatibleTrackFormats, .insufficientData:
                return .Unknown
            }
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet:
                return .NoInternet
            case .timedOut:
                return .ServerTimeout
            case .fileDoesNotExist, .cannotOpenFile:
                return .CouldNotOpenFile
            default:
                return .Unknown
            }
        }

        return .Unknown
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
        let generation = snapshotStore.withValue { snapshot in
            snapshot.generation += 1
            snapshot.currentState = .Stalled
            snapshot.nextStreamable = nextStreamable
            snapshot.desiredNextStreamable = nextStreamable
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.isPreparingCurrentTrack = true
            return snapshot.generation
        }
        playbackPresentationController.setPlaybackState(.Stalled)
        emitStateIfNeeded(previous: previousState, current: .Stalled)

        Task { [weak self] in
            guard let self else { return }

            do {
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try self.audioSessionController.configurePlaybackSession(shouldActivate: true)
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try await self.player.stop()
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                try await self.player.prepare(
                    current: self.makePlaybackSource(from: currentStreamable),
                    next: nextStreamable.map(self.makePlaybackSource(from:))
                )
                guard self.shouldContinueAsyncWork(for: generation) else { return }
                if resumeTime > 0 {
                    try await self.player.seek(to: resumeTime)
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                }
                if shouldResume {
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
                        $0.currentState = .Stopped
                    }
                    self.playbackPresentationController.setPlaybackState(.Stopped)
                    self.emitStateIfNeeded(previous: .Stalled, current: .Stopped)
                    self.emitError(error, for: currentStreamable)
                }
            }
        }
    }

    private func numericCode(for error: PlaybackStreamError) -> Int {
        switch error {
        case .Init: return 0
        case .NotAvail: return 1
        case .NoInternet: return 2
        case .InvalidUrl: return 3
        case .SslUnsupported: return 4
        case .ServerTimeout: return 5
        case .CouldNotOpenFile: return 6
        case .FileInvalidFormat: return 7
        case .SupportedCodec: return 8
        case .UnsupportedSampleFormat: return 9
        case .InsufficientMemory: return 10
        case .No3D: return 11
        case .Unknown: return 12
        }
    }

    private func shouldContinueAsyncWork(for generation: UInt64) -> Bool {
        !teardownRequested.get() && snapshotStore.get().generation == generation
    }
}
