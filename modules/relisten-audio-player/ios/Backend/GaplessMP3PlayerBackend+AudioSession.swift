import AVFAudio
import Foundation

extension GaplessMP3PlayerBackend {
    func prepareAudioSessionOnQueue(shouldActivate: Bool) throws {
        guard !teardownRequested.get() else { throw CancellationError() }
        installAudioSessionHandlersIfNeededOnQueue()
        do {
            try audioSessionController.configurePlaybackSession(shouldActivate: shouldActivate)
        } catch {
            backendErrorLog.error(
                "failed", "audio session setup",
                playbackLogIntegerField("gen", snapshotStore.get().generation),
                playbackLogErrorField(String(describing: error))
            )
            let nsError = error as NSError
            throw GaplessPlaybackFailure(
                kind: .audioPipeline,
                message: "Could not configure the audio session",
                description: nsError.localizedDescription,
                isRetryable: true,
                platformCode: nsError.code,
                platformName: nsError.domain
            )
        }
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
            onMediaServices: { [weak self] kind in
                self?.backendQueue.async {
                    self?.handleMediaServicesOnQueue(kind)
                }
            }
        )
        guard !teardownRequested.get() else { return }
        audioSessionController.beginReceivingRemoteControlEvents()
        hasInstalledAudioSessionHandlers = true

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
        let action = snapshotStore.withValue { $0.presentation.interruptionBegan() }
        guard action == .pause else { return }
        player.pause()
        let current = applyPresentationAndEmit(previous: previous, freezeAfterUpdate: true)
        snapshotStore.withValue {
            guard $0.generation == current.generation else { return }
            $0.presentation.freezeWritesForInterruption()
        }
    }

    private func handleInterruptionEndedOnQueue(_ event: AudioInterruptionEvent) {
        let previous = snapshotStore.get()
        let action = snapshotStore.withValue {
            $0.presentation.interruptionEnded(
                shouldResume: event.options.contains(.shouldResume)
            )
        }
        if action == .resume {
            resumeOnQueue()
        } else {
            if action == .yield {
                player.pause()
                snapshotStore.withValue {
                    if $0.currentState != .Stopped { $0.currentState = .Paused }
                }
            }
            applyPresentationAndEmit(previous: previous)
        }
        startProgressPollingIfNeededOnQueue(for: snapshotStore.get().generation)
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
                let statusRevision = self.snapshotStore.get().presentation.transportRevision
                let status = await self.player.status()
                self.backendQueue.async {
                    guard self.shouldContinueAsyncWork(for: generation) else { return }
                    self.snapshotStore.withValue { $0.isPreparingCurrentTrack = false }
                    self.applyStatus(status, transportRevision: statusRevision)
                    let previous = self.snapshotStore.get()
                    let shouldResume = self.snapshotStore.withValue { $0.presentation.completeMediaServicesReset() }
                    if shouldResume {
                        self.resumeOnQueue()
                    } else {
                        self.applyPresentationAndEmit(previous: previous)
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

}
