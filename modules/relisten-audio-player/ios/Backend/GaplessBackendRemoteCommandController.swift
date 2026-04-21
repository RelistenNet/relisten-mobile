import Foundation
import MediaPlayer

final class GaplessBackendRemoteCommandController {
    private static let backendQueueSpecificKey = DispatchSpecificKey<String>()

    private let snapshotStore: BackendLockedValue<GaplessBackendSnapshot>
    private let backendQueue: DispatchQueue
    private let backendQueueSpecificValue = UUID().uuidString
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
        self.backendQueue.setSpecific(key: Self.backendQueueSpecificKey, value: backendQueueSpecificValue)
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
        performNativeCommandSynchronously {
            resumeOnQueue()
        }
        return .success
    }

    private func handlePauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        logRemoteCommand("pause", result: .success, snapshot: snapshotStore.get())
        emitRemoteControl("pause")
        performNativeCommandSynchronously {
            pauseOnQueue()
        }
        return .success
    }

    private func handleTogglePlayPauseRemoteCommand(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        let snapshot = snapshotStore.get()
        logRemoteCommand("togglePlayPause", result: snapshot.currentStreamable == nil ? .commandFailed : .success, snapshot: snapshot)
        guard snapshot.currentStreamable != nil else {
            return .commandFailed
        }
        performNativeCommandSynchronously {
            let shouldPause = shouldRemoteTogglePause(snapshot: snapshotStore.get())
            emitRemoteControl(shouldPause ? "pause" : "resume")
            if shouldPause {
                pauseOnQueue()
            } else {
                resumeOnQueue()
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
        performNativeCommandSynchronously {
            seekToTimeOnQueue(Int64(acceptedTime * 1000))
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

    private func performNativeCommandSynchronously(_ command: () -> Void) {
        // MediaRemote decides the immediate Control Center state from the
        // command response plus the latest Now Playing snapshot. For native-owned
        // commands, enqueue our snapshot before returning success so pause/play
        // cannot acknowledge against stale rate=1 metadata.
        if DispatchQueue.getSpecific(key: Self.backendQueueSpecificKey) == backendQueueSpecificValue {
            command()
            return
        } else {
            backendQueue.sync(execute: command)
        }

        // Presentation writes are marshalled to main. When the remote command
        // arrives off-main, wait for the enqueued Now Playing write to drain
        // before returning the command status to MediaRemote. If the handler is
        // already on main, returning lets the queued write run on the next turn.
        guard !Thread.isMainThread else { return }
        DispatchQueue.main.sync {}
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
