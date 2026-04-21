import Foundation
import MediaPlayer

final class GaplessBackendPresentationCoordinator {
    private let playbackPresentationController: PlaybackPresentationController

    init(playbackPresentationController: PlaybackPresentationController = PlaybackPresentationController()) {
        self.playbackPresentationController = playbackPresentationController
    }

    @discardableResult
    func apply(
        snapshotStore: BackendLockedValue<GaplessBackendSnapshot>,
        freezeAfterUpdate: Bool = false
    ) -> GaplessBackendSnapshot {
        let now = ProcessInfo.processInfo.systemUptime
        let (snapshot, decision) = snapshotStore.withValue { snapshot -> (GaplessBackendSnapshot, MediaCenterPresentationDecision) in
            let decision = resolveDecision(for: snapshot, now: now)
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

    func teardown() {
        playbackPresentationController.teardown()
    }

    func logStatusApplication(status: GaplessMP3PlayerStatus, snapshot: GaplessBackendSnapshot) {
        let decision = resolveDecision(
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

    private func resolveDecision(
        for snapshot: GaplessBackendSnapshot,
        now: TimeInterval
    ) -> MediaCenterPresentationDecision {
        MediaCenterPresentationInput(
            hasCurrentMetadata: snapshot.currentStreamable != nil,
            presentation: snapshot.presentation,
            isWithinPresentationGraceWindow: snapshot.presentation.isWithinGraceWindow(
                now: now,
                interval: resumePresentationGraceInterval
            )
        ).resolve()
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
        from snapshot: GaplessBackendSnapshot,
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
        snapshot: GaplessBackendSnapshot
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
}
