import Foundation

extension GaplessMP3PlayerBackend {
    func handleRuntimeEvent(_ event: GaplessRuntimeEvent) {
        guard !teardownRequested.get() else { return }
        guard let eventSessionID = event.sessionID, eventSessionID == snapshotStore.get().currentSessionID else {
            return
        }
        switch event {
        case .playbackFailed(let failure, _):
            let previous = snapshotStore.get()
            snapshotStore.withValue {
                $0.presentation.failRender()
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
                snapshot.presentation.stop()
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

    func handleHTTPLogEvent(_ event: GaplessHTTPLogEvent) {
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
}
