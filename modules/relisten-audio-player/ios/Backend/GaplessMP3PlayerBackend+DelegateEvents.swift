import Foundation

extension GaplessMP3PlayerBackend {
    @discardableResult
    func applyPresentationAndEmit(previous: GaplessBackendSnapshot, freezeAfterUpdate: Bool = false) -> GaplessBackendSnapshot {
        // Presentation is the only place that translates native renderer facts
        // into both JS state and Media Center state. Keeping delegate emission
        // adjacent to that write makes the two surfaces easier to reason about.
        let current = presentationCoordinator.apply(
            snapshotStore: snapshotStore,
            freezeAfterUpdate: freezeAfterUpdate
        )
        emitStateIfNeeded(previous: previous.currentState, current: current.currentState)
        emitProgressIfNeeded(previous: previous, current: current)
        emitDownloadProgressIfNeeded(previous: previous, current: current)
        if previous.currentStreamable?.identifier != current.currentStreamable?.identifier ||
           previous.elapsed != current.elapsed || previous.currentDuration != current.currentDuration ||
           previous.currentState != current.currentState || freezeAfterUpdate {
            emitCheckpoint(current.currentStreamable == nil ? previous : current,
                           force: freezeAfterUpdate || current.currentState == .Paused || current.currentState == .Stopped)
        }
        return current
    }

    /// Capture identity and timing together on backendQueue, never by rereading mutable state
    /// from a delayed delegate callback. This also journals interruption snapshots when JS sleeps.
    func emitCheckpoint(_ snapshot: GaplessBackendSnapshot, force: Bool) {
        guard let streamable = snapshot.currentStreamable else { return }
        guard !snapshot.isPreparingCurrentTrack || snapshot.elapsed != nil else { return }
        let checkpointSequence = checkpointStore.nextSequence()
        let changed = lastCheckpointIdentifier != streamable.identifier
        lastCheckpointIdentifier = streamable.identifier
        let checkpoint = PlaybackCheckpoint(
            sessionId: backendInstanceID, sequence: checkpointSequence,
            identifier: streamable.identifier, sourceTrackUuid: streamable.cacheKey,
            elapsed: snapshot.elapsed.flatMap { $0.isFinite ? max(0, $0) : nil },
            duration: snapshot.currentDuration.flatMap { $0.isFinite && $0 > 0 ? $0 : nil },
            capturedAt: Date().timeIntervalSince1970 * 1000,
            playbackState: snapshot.currentState.rawValue, trackChanged: changed,
            checkpoint: force
        )
        do { try checkpointStore.write(checkpoint) }
        catch { backendErrorLog.error("failed", "playback checkpoint write", playbackLogErrorField(String(describing: error))) }
        delegateQueue.async { self.delegate?.playbackSnapshot(checkpoint) }
    }

    func emitRemoteControl(_ method: String) {
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

    func emitError(_ error: Error, for streamable: RelistenGaplessStreamable) {
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

    private func emitStateIfNeeded(previous: PlaybackState, current: PlaybackState) {
        guard previous != current else { return }
        delegateQueue.async {
            self.delegate?.playbackStateChanged(newPlaybackState: current)
        }
    }

    private func emitProgressIfNeeded(previous: GaplessBackendSnapshot, current: GaplessBackendSnapshot) {
        guard previous.elapsed != current.elapsed || previous.currentDuration != current.currentDuration else { return }
        delegateQueue.async {
            self.delegate?.playbackProgressChanged(elapsed: current.elapsed, duration: current.currentDuration)
        }
    }

    private func emitDownloadProgressIfNeeded(previous: GaplessBackendSnapshot, current: GaplessBackendSnapshot) {
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
}
