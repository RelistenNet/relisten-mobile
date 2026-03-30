import AVFAudio
import MediaPlayer
import UIKit

final class AudioSessionController {
    let commandCenter = MPRemoteCommandCenter.shared()
    private var playCommandTarget: Any?
    private var pauseCommandTarget: Any?
    private var togglePlayPauseCommandTarget: Any?
    private var changePlaybackPositionCommandTarget: Any?
    private var nextTrackCommandTarget: Any?
    private var previousTrackCommandTarget: Any?

    func configurePlaybackSession(shouldActivate: Bool) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try session.setActive(shouldActivate)
    }

    func configureRemoteCommands(
        onPlay: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus,
        onPause: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus,
        onTogglePlayPause: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus,
        onSeek: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus,
        onNextTrack: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus,
        onPreviousTrack: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
        runOnMainThread {
            if let playCommandTarget = self.playCommandTarget {
                self.commandCenter.playCommand.removeTarget(playCommandTarget)
            }
            self.commandCenter.playCommand.isEnabled = true
            self.playCommandTarget = self.commandCenter.playCommand.addTarget(handler: onPlay)

            if let pauseCommandTarget = self.pauseCommandTarget {
                self.commandCenter.pauseCommand.removeTarget(pauseCommandTarget)
            }
            self.commandCenter.pauseCommand.isEnabled = true
            self.pauseCommandTarget = self.commandCenter.pauseCommand.addTarget(handler: onPause)

            if let togglePlayPauseCommandTarget = self.togglePlayPauseCommandTarget {
                self.commandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseCommandTarget)
            }
            self.commandCenter.togglePlayPauseCommand.isEnabled = true
            self.togglePlayPauseCommandTarget = self.commandCenter.togglePlayPauseCommand.addTarget(handler: onTogglePlayPause)

            if let changePlaybackPositionCommandTarget = self.changePlaybackPositionCommandTarget {
                self.commandCenter.changePlaybackPositionCommand.removeTarget(changePlaybackPositionCommandTarget)
            }
            self.commandCenter.changePlaybackPositionCommand.isEnabled = true
            self.changePlaybackPositionCommandTarget = self.commandCenter.changePlaybackPositionCommand.addTarget(handler: onSeek)

            if let nextTrackCommandTarget = self.nextTrackCommandTarget {
                self.commandCenter.nextTrackCommand.removeTarget(nextTrackCommandTarget)
            }
            self.commandCenter.nextTrackCommand.isEnabled = true
            self.nextTrackCommandTarget = self.commandCenter.nextTrackCommand.addTarget(handler: onNextTrack)

            if let previousTrackCommandTarget = self.previousTrackCommandTarget {
                self.commandCenter.previousTrackCommand.removeTarget(previousTrackCommandTarget)
            }
            self.commandCenter.previousTrackCommand.isEnabled = true
            self.previousTrackCommandTarget = self.commandCenter.previousTrackCommand.addTarget(handler: onPreviousTrack)

            self.commandCenter.changePlaybackRateCommand.isEnabled = false
            self.commandCenter.changeRepeatModeCommand.isEnabled = false
            self.commandCenter.changeShuffleModeCommand.isEnabled = false
            self.commandCenter.skipForwardCommand.isEnabled = false
            self.commandCenter.skipBackwardCommand.isEnabled = false
        }
    }

    func clearRemoteCommands() {
        runOnMainThread {
            self.commandCenter.playCommand.isEnabled = false
            if let playCommandTarget = self.playCommandTarget {
                self.commandCenter.playCommand.removeTarget(playCommandTarget)
                self.playCommandTarget = nil
            }

            self.commandCenter.pauseCommand.isEnabled = false
            if let pauseCommandTarget = self.pauseCommandTarget {
                self.commandCenter.pauseCommand.removeTarget(pauseCommandTarget)
                self.pauseCommandTarget = nil
            }

            self.commandCenter.togglePlayPauseCommand.isEnabled = false
            if let togglePlayPauseCommandTarget = self.togglePlayPauseCommandTarget {
                self.commandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseCommandTarget)
                self.togglePlayPauseCommandTarget = nil
            }

            self.commandCenter.changePlaybackPositionCommand.isEnabled = false
            if let changePlaybackPositionCommandTarget = self.changePlaybackPositionCommandTarget {
                self.commandCenter.changePlaybackPositionCommand.removeTarget(changePlaybackPositionCommandTarget)
                self.changePlaybackPositionCommandTarget = nil
            }

            self.commandCenter.nextTrackCommand.isEnabled = false
            if let nextTrackCommandTarget = self.nextTrackCommandTarget {
                self.commandCenter.nextTrackCommand.removeTarget(nextTrackCommandTarget)
                self.nextTrackCommandTarget = nil
            }

            self.commandCenter.previousTrackCommand.isEnabled = false
            if let previousTrackCommandTarget = self.previousTrackCommandTarget {
                self.commandCenter.previousTrackCommand.removeTarget(previousTrackCommandTarget)
                self.previousTrackCommandTarget = nil
            }

            self.commandCenter.changePlaybackRateCommand.isEnabled = false
            self.commandCenter.changeRepeatModeCommand.isEnabled = false
            self.commandCenter.changeShuffleModeCommand.isEnabled = false
            self.commandCenter.skipForwardCommand.isEnabled = false
            self.commandCenter.skipBackwardCommand.isEnabled = false
        }
    }

    func beginReceivingRemoteControlEvents() {
        runOnMainThread {
            UIApplication.shared.beginReceivingRemoteControlEvents()
        }
    }

    func endReceivingRemoteControlEvents() {
        runOnMainThread {
            UIApplication.shared.endReceivingRemoteControlEvents()
        }
    }

    func teardown() {
        clearRemoteCommands()
        endReceivingRemoteControlEvents()
    }

    private func runOnMainThread(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
            return
        }

        DispatchQueue.main.async(execute: work)
    }
}
