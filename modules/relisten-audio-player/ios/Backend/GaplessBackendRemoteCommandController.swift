import Foundation
import MediaPlayer

final class GaplessBackendRemoteCommandController {
    private let snapshotStore: BackendLockedValue<GaplessBackendSnapshot>
    private let backendQueue: DispatchQueue
    private let emitRemoteControl: (String) -> Void
    private let resumeOnQueue: () -> Void
    private let pauseOnQueue: () -> Void
    private let seekToTimeOnQueue: (Int64) -> Void

    init(
        snapshotStore: BackendLockedValue<GaplessBackendSnapshot>,
        backendQueue: DispatchQueue,
        emitRemoteControl: @escaping (String) -> Void,
        resumeOnQueue: @escaping () -> Void,
        pauseOnQueue: @escaping () -> Void,
        seekToTimeOnQueue: @escaping (Int64) -> Void
    ) {
        self.snapshotStore = snapshotStore
        self.backendQueue = backendQueue
        self.emitRemoteControl = emitRemoteControl
        self.resumeOnQueue = resumeOnQueue
        self.pauseOnQueue = pauseOnQueue
        self.seekToTimeOnQueue = seekToTimeOnQueue
    }

    func configureRemoteCommands(on audioSessionController: AudioSessionController) {
        audioSessionController.configureRemoteCommands(
            onPlay: handleResumeRemoteCommand,
            onPause: handlePauseRemoteCommand,
            onTogglePlayPause: handleTogglePlayPauseRemoteCommand,
            onSeek: handleSeekRemoteCommand,
            onNextTrack: handleNextTrackRemoteCommand,
            onPreviousTrack: handlePreviousTrackRemoteCommand
        )
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

    private func shouldRemoteTogglePause(snapshot: GaplessBackendSnapshot) -> Bool {
        snapshot.desiredTransport == .playing && snapshot.systemSuspension == .none
    }

    private func logRemoteCommand(
        _ method: String,
        result: MPRemoteCommandHandlerStatus,
        snapshot: GaplessBackendSnapshot
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
}
