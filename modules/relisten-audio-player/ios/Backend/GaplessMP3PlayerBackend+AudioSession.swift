import AVFAudio
import Foundation

extension GaplessMP3PlayerBackend {
    func prepareAudioSessionOnQueue() {
        prepareAudioSessionOnQueue(shouldActivate: !AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint)
    }

    func prepareAudioSessionOnQueue(shouldActivate: Bool) {
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

    func installAudioSessionHandlersIfNeededOnQueue() {
        guard !teardownRequested.get() else { return }
        guard !hasInstalledAudioSessionHandlers else { return }

        remoteCommandController.configureRemoteCommands(on: audioSessionController)
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
            $0.presentation.pause()
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
            $0.presentation.beginTemporaryInterruption()
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
            $0.presentation.freezeWritesForInterruption()
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
                $0.presentation.clearSuspension()
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
            $0.presentation.pause()
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
            $0.presentation.suppressForExternalMedia()
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
                $0.presentation.stop()
                $0.currentState = .Stopped
            }
            return
        }

        player.pause()
        snapshotStore.withValue {
            // Media services loss invalidates the renderer underneath us. Keep
            // Relisten visible as interrupted only when we still own playback.
            $0.presentation.beginTemporaryInterruption(renderStatus: .failed)
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
                $0.presentation.stop()
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
            snapshot.presentation.beginTemporaryInterruption(renderStatus: .preparing)
            snapshot.nextStreamable = nextStreamable
            snapshot.desiredNextStreamable = nextStreamable
            snapshot.activeTrackDownloadedBytes = nil
            snapshot.activeTrackTotalBytes = nil
            snapshot.pendingStartTimeAfterPrepare = resumeTime > 0
                ? GaplessBackendPendingStartTimeAfterPrepare(
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
                            $0.presentation.beginPlayback(
                                now: ProcessInfo.processInfo.systemUptime,
                                renderStatus: .preparing
                            )
                        } else if $0.systemSuspension == .temporaryInterruption {
                            $0.presentation.clearSuspension()
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
                        $0.presentation.stop(renderStatus: .failed)
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
}
