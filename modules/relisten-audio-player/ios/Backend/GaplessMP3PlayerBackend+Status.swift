import Foundation

extension GaplessMP3PlayerBackend {
    func refreshStatusOnQueue(for generation: UInt64) {
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

    func applyLatestDesiredNextIfNeededOnQueue(for generation: UInt64) {
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

    func applyStatus(_ status: GaplessMP3PlayerStatus, seekCompletion: SeekCommandExecution? = nil) {
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
        let renderStatus = MediaCenterRenderStatus(playbackPhase: status.playbackPhase)
        let seekProjection = seekCompletion.map {
            SeekCompletionStatusProjection(
                desiredTransport: previous.desiredTransport,
                clampedSeekTime: $0.clampedTime,
                reportedElapsed: status.currentTime,
                reportedRenderStatus: renderStatus,
                reportedRenderIsPlaying: status.isPlaying
            )
        }

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
            snapshot.elapsed = seekProjection?.elapsed ?? status.currentTime
            snapshot.presentation.applyRenderStatus(
                renderStatus: seekProjection?.renderStatus ?? renderStatus,
                renderIsPlaying: seekProjection?.renderIsPlaying ?? status.isPlaying,
                hasCurrentSource: status.currentSource != nil
            )
            snapshot.currentStreamable = status.currentSource == nil ? nil : currentStreamable
            snapshot.nextStreamable = status.nextSource == nil ? nil : nextStreamable
            snapshot.activeTrackDownloadedBytes = downloadedBytes
            snapshot.activeTrackTotalBytes = totalBytes
            snapshot.isPreparingCurrentTrack = (seekProjection?.renderStatus ?? renderStatus) == .preparing
            if status.playbackPhase == .stopped || status.currentSource == nil {
                snapshot.progressPollingGeneration = nil
            }
        }

        let current = applyPresentationAndEmit(previous: previous)
        presentationCoordinator.logStatusApplication(status: status, snapshot: current)
        translateStreamingCacheCompletionIfNeeded(status: status, snapshot: current)
        if shouldKeepProgressPolling(for: current) {
            startProgressPollingIfNeededOnQueue(for: current.generation)
        }
    }

    func makePlaybackSource(from streamable: RelistenGaplessStreamable) -> GaplessPlaybackSource {
        GaplessPlaybackSource(
            id: streamable.identifier,
            url: streamable.url,
            cacheKey: streamable.cacheKey,
            headers: [:],
            expectedContentLength: nil
        )
    }

    func makeProgressSnapshot(from snapshot: GaplessBackendSnapshot) -> PlaybackBackendProgressSnapshot {
        PlaybackBackendProgressSnapshot(
            elapsed: snapshot.elapsed,
            duration: snapshot.currentDuration,
            activeTrackDownloadedBytes: snapshot.activeTrackDownloadedBytes,
            activeTrackTotalBytes: snapshot.activeTrackTotalBytes
        )
    }

    func streamableMatching(id: String?, snapshot: GaplessBackendSnapshot) -> RelistenGaplessStreamable? {
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

    func shouldIgnoreStatus(for snapshot: GaplessBackendSnapshot) -> Bool {
        // External-media suppression is stronger than renderer truth. The
        // player can still report a prepared source, but Relisten has yielded
        // lock-screen ownership until the user explicitly resumes Relisten.
        snapshot.presentation.isSuppressed
    }

    func consumePendingStartTimeAfterPrepareOnQueue(for generation: UInt64) -> TimeInterval? {
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

    func updateSnapshotOnQueue(_ mutate: (inout GaplessBackendSnapshot) -> Void) {
        let previous = snapshotStore.get()
        snapshotStore.withValue { snapshot in
            mutate(&snapshot)
        }
        applyPresentationAndEmit(previous: previous)
    }

    func scheduleResumeGraceExpirationIfNeededOnQueue(for generation: UInt64) {
        backendQueue.asyncAfter(deadline: .now() + resumePresentationGraceInterval) { [weak self] in
            guard let self else { return }
            let previous = self.snapshotStore.get()
            guard previous.generation == generation,
                  previous.presentation.hasStartupGrace(),
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

    func scheduleSeekGraceExpirationIfNeededOnQueue(for generation: UInt64, seekSequence: UInt64) {
        backendQueue.asyncAfter(deadline: .now() + resumePresentationGraceInterval) { [weak self] in
            guard let self else { return }
            let previous = self.snapshotStore.get()
            guard previous.generation == generation,
                  previous.seekSequence == seekSequence,
                  previous.presentation.hasSeekRestartGrace(seekSequence: seekSequence),
                  previous.desiredTransport == .playing,
                  previous.systemSuspension == .none else {
                return
            }
            // Seeking restarts render output even though user intent remains
            // play. If the graph still has not confirmed audio after the grace
            // window, re-run the presentation decision so JS may show stalled
            // while Media Center remains in desired-play.
            self.applyPresentationAndEmit(previous: previous)
        }
    }

    func startProgressPollingIfNeededOnQueue(for generation: UInt64) {
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

    private func shouldKeepProgressPolling(for snapshot: GaplessBackendSnapshot) -> Bool {
        guard snapshot.currentStreamable != nil else { return false }
        guard !shouldIgnoreStatus(for: snapshot) else { return false }

        switch snapshot.currentState {
        case .Playing, .Paused, .Stalled:
            return true
        case .Stopped:
            return false
        }
    }

    private func logIgnoredStatusDuringSuppression(snapshot: GaplessBackendSnapshot) {
        backendStateLog.debug(
            "ignored",
            "status during media center suppression",
            playbackLogField("write", snapshot.mediaCenterWriteMode.rawValue),
            playbackLogField("susp", snapshot.systemSuspension.rawValue),
            playbackLogField("src", snapshot.currentStreamable?.identifier),
            playbackLogIntegerField("gen", snapshot.generation)
        )
    }

    private func unsignedValue(_ value: Int64?) -> UInt64? {
        guard let value, value >= 0 else { return nil }
        return UInt64(value)
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

    private func translateStreamingCacheCompletionIfNeeded(
        status: GaplessMP3PlayerStatus,
        snapshot: GaplessBackendSnapshot
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
}
