//
//  AudioSession.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

import AVFAudio

extension RelistenGaplessAudioPlayer {
    internal func setupAudioSession(shouldActivate: Bool) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] setupAudioSession(shouldActivate: \(shouldActivate))")

        let session = AVAudioSession.sharedInstance()

        try? session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try? session.setActive(shouldActivate)

        // Register for Route Change notifications
        if shouldActivate, !audioSessionObserversSetUp {
            NSLog("[relisten-audio-player] setupAudioSession(shouldActivate: \(shouldActivate)): setting up notifications")

            NotificationCenter.default.addObserver(self, selector: #selector(handleRouteChange), name: AVAudioSession.routeChangeNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleInterruption), name: AVAudioSession.interruptionNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleMediaServicesWereReset), name: AVAudioSession.mediaServicesWereResetNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleMediaServicesWereLost), name: AVAudioSession.mediaServicesWereLostNotification, object: session)

            audioSessionObserversSetUp = true
        }

        // Always ensure the command center is ready; some CarPlay cold-start flows
        // end up with only Play enabled unless this is registered on the main queue.
        addCommandCenterListeners()

        if !audioSessionAlreadySetUp {
            delegateQueue.async {
                self.delegate?.audioSessionWasSetup()
            }
            audioSessionAlreadySetUp = true
        }
    }
    
    internal func addCommandCenterListeners() {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.addCommandCenterListeners()
            }
            return
        }

        NSLog("[relisten-audio-player] addCommandCenterListeners()")

        if let playCommandTarget {
            commandCenter.playCommand.removeTarget(playCommandTarget)
        }
        commandCenter.playCommand.isEnabled = true
        playCommandTarget = commandCenter.playCommand.addTarget(handler: _resume)

        if let pauseCommandTarget {
            commandCenter.pauseCommand.removeTarget(pauseCommandTarget)
        }
        commandCenter.pauseCommand.isEnabled = true
        pauseCommandTarget = commandCenter.pauseCommand.addTarget(handler: _pause)

        if let togglePlayPauseCommandTarget {
            commandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseCommandTarget)
        }
        commandCenter.togglePlayPauseCommand.isEnabled = true
        togglePlayPauseCommandTarget = commandCenter.togglePlayPauseCommand.addTarget(handler: _togglePlayPause)

        if let changePlaybackPositionCommandTarget {
            commandCenter.changePlaybackPositionCommand.removeTarget(changePlaybackPositionCommandTarget)
        }
        commandCenter.changePlaybackPositionCommand.isEnabled = true
        changePlaybackPositionCommandTarget = commandCenter.changePlaybackPositionCommand.addTarget(handler: _seekTo)

        if let nextTrackCommandTarget {
            commandCenter.nextTrackCommand.removeTarget(nextTrackCommandTarget)
        }
        commandCenter.nextTrackCommand.isEnabled = true
        nextTrackCommandTarget = commandCenter.nextTrackCommand.addTarget(handler: _nextTrack)

        if let previousTrackCommandTarget {
            commandCenter.previousTrackCommand.removeTarget(previousTrackCommandTarget)
        }
        commandCenter.previousTrackCommand.isEnabled = true
        previousTrackCommandTarget = commandCenter.previousTrackCommand.addTarget(handler: _prevTrack)

        commandCenter.changePlaybackRateCommand.isEnabled = false
        commandCenter.changeRepeatModeCommand.isEnabled = false
        commandCenter.changeShuffleModeCommand.isEnabled = false

        // Explicitly disable skip commands to prevent them from interfering with track commands
        commandCenter.skipForwardCommand.isEnabled = false
        commandCenter.skipBackwardCommand.isEnabled = false

        audioSessionController.beginReceivingRemoteControlEvents()
    }

    internal func tearDownAudioSession() {
        if audioSessionObserversSetUp {
            NSLog("[relisten-audio-player] tearDownAudioSession()")

            NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.mediaServicesWereLostNotification, object: nil)

            commandCenter.playCommand.isEnabled = false
            if let playCommandTarget {
                commandCenter.playCommand.removeTarget(playCommandTarget)
                self.playCommandTarget = nil
            }
            commandCenter.pauseCommand.isEnabled = false
            if let pauseCommandTarget {
                commandCenter.pauseCommand.removeTarget(pauseCommandTarget)
                self.pauseCommandTarget = nil
            }
            commandCenter.togglePlayPauseCommand.isEnabled = false
            if let togglePlayPauseCommandTarget {
                commandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseCommandTarget)
                self.togglePlayPauseCommandTarget = nil
            }
            commandCenter.changePlaybackPositionCommand.isEnabled = false
            if let changePlaybackPositionCommandTarget {
                commandCenter.changePlaybackPositionCommand.removeTarget(changePlaybackPositionCommandTarget)
                self.changePlaybackPositionCommandTarget = nil
            }
            commandCenter.nextTrackCommand.isEnabled = false
            if let nextTrackCommandTarget {
                commandCenter.nextTrackCommand.removeTarget(nextTrackCommandTarget)
                self.nextTrackCommandTarget = nil
            }
            commandCenter.previousTrackCommand.isEnabled = false
            if let previousTrackCommandTarget {
                commandCenter.previousTrackCommand.removeTarget(previousTrackCommandTarget)
                self.previousTrackCommandTarget = nil
            }
            commandCenter.changePlaybackRateCommand.isEnabled = false
            commandCenter.changeRepeatModeCommand.isEnabled = false
            commandCenter.changeShuffleModeCommand.isEnabled = false
            commandCenter.skipForwardCommand.isEnabled = false
            commandCenter.skipBackwardCommand.isEnabled = false

            audioSessionController.endReceivingRemoteControlEvents()

            audioSessionObserversSetUp = false
        }
    }

    @objc func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        else {
            NSLog("[relisten-audio-player][bass][handleRouteChange] No AVAudioSessionRouteChangeReasonKey")
            return
        }

        var seccReason = ""

        switch reason {
        case .noSuitableRouteForCategory:
            seccReason = "The route changed because no suitable route is now available for the specified category."
        case .wakeFromSleep:
            seccReason = "The route changed when the device woke up from sleep."
        case .override:
            seccReason = "The output route was overridden by the app."
        case .categoryChange:
            seccReason = "The category of the session object changed."
        case .oldDeviceUnavailable:
            seccReason = "The previous audio output path is no longer available."
            
            self.bassQueue.async {
                self.pause()
            }
        case .newDeviceAvailable:
            seccReason = "A preferred new audio output path is now available."
        case .unknown:
            seccReason = "The reason for the change is unknown."
        case .routeConfigurationChange:
            seccReason = "A value that indicates that the configuration for a set of I/O ports has changed."
        @unknown default:
            seccReason = "Unknown value: \(reason)"
        }

        NSLog("[relisten-audio-player]handlRouteChange: %@", seccReason)
    }

    @objc func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo, notification.name != AVAudioSession.interruptionNotification, let interruptionValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt, let interruptionType = AVAudioSession.InterruptionType(rawValue: interruptionValue)
        else {
            return
        }

        NSLog("[relisten-audio-player][bass][handleInterruption]: %@ interruption type %@", "\(notification.name)", "\(interruptionType)")

        switch interruptionType {
        case .began:
            // Audio has stopped, already inactive
            // Change state of UI, etc., to reflect non-playing state
            self.bassQueue.async { [weak self] in
                guard let self else { return }
                
                let state = self.currentState

                self.wasPlayingWhenInterrupted = state == .Playing || state == .Stalled

                self.pause()
            }
        case .ended:
            // Make session active
            // Update user interface
            // AVAudioSessionInterruptionOptionShouldResume option
            guard let interruptionOptionValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else {
                break
            }

            switch AVAudioSession.InterruptionOptions(rawValue: interruptionOptionValue) {
            case .shouldResume:
                // Indicates that the audio session is active and immediately ready to be used. Your app can resume the audio operation that was interrupted.
                self.bassQueue.async { [weak self] in
                    guard let self else { return }
                    
                    if wasPlayingWhenInterrupted {
                        self.resume()
                    }
                }
            default:
                break
            }
        @unknown default:
            break
        }
    }

    @objc func handleMediaServicesWereReset(_: Notification) {
        restartPlayback()
    }

    @objc func handleMediaServicesWereLost(_: Notification) {
        restartPlayback()
    }

    internal func restartPlayback() {
        bassQueue.async { [weak self] in
            guard let self else { return }

            tearDownAudioSession()
            setupAudioSession(shouldActivate: true)

            let savedActiveStreamable = activeStreamIntent?.streamable
            let nextStreamable = nextStreamIntent?.streamable
            let savedElapsed = self.elapsed

            maybeTearDownBASS()

            currentState = .Stopped

            if let savedActiveStreamable {
                if let savedElapsed {
                    playStreamableImmediately(savedActiveStreamable, startingAtMs: Int64(savedElapsed * 1000))
                } else {
                    playStreamableImmediately(savedActiveStreamable, startingAtMs: nil)
                }
            }

            if let nextStreamable {
                self.setNextStream(nextStreamable)
            }
        }
    }
}
