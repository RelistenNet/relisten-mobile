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

        try? session.setCategory(.playback)
        try? session.setActive(shouldActivate)

        // Register for Route Change notifications
        if shouldActivate, !audioSessionObserversSetUp {
            NSLog("[relisten-audio-player] setupAudioSession(shouldActivate: \(shouldActivate)): setting up notifications and command center")

            NotificationCenter.default.addObserver(self, selector: #selector(handleRouteChange), name: AVAudioSession.routeChangeNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleInterruption), name: AVAudioSession.interruptionNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleMediaServicesWereReset), name: AVAudioSession.mediaServicesWereResetNotification, object: session)
            NotificationCenter.default.addObserver(self, selector: #selector(handleMediaServicesWereLost), name: AVAudioSession.mediaServicesWereLostNotification, object: session)

            addCommandCenterListeners()

            DispatchQueue.main.async {
                UIApplication.shared.beginReceivingRemoteControlEvents()
            }

            audioSessionObserversSetUp = true
        }

        if !audioSessionAlreadySetUp {
            delegateQueue.async {
                self.delegate?.audioSessionWasSetup(self)
            }
            audioSessionAlreadySetUp = true
        }
    }
    
    internal func addCommandCenterListeners() {
        NSLog("[relisten-audio-player] addCommandCenterListeners()")

        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget(handler: _resume)
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget(handler: _pause)
        commandCenter.changePlaybackPositionCommand.isEnabled = true
        commandCenter.changePlaybackPositionCommand.addTarget(handler: _seekTo)
        commandCenter.nextTrackCommand.isEnabled = true
        commandCenter.nextTrackCommand.addTarget(handler: _nextTrack)
        commandCenter.previousTrackCommand.isEnabled = true
        commandCenter.previousTrackCommand.addTarget(handler: _prevTrack)
    }

    internal func tearDownAudioSession() {
        if audioSessionObserversSetUp {
            NSLog("[relisten-audio-player] tearDownAudioSession()")
            
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.mediaServicesWereLostNotification, object: nil)

            commandCenter.playCommand.isEnabled = false
            commandCenter.playCommand.removeTarget(_resume)
            commandCenter.pauseCommand.isEnabled = false
            commandCenter.pauseCommand.removeTarget(_pause)
            commandCenter.changePlaybackPositionCommand.isEnabled = false
            commandCenter.changePlaybackPositionCommand.removeTarget(_seekTo)
            commandCenter.nextTrackCommand.isEnabled = false
            commandCenter.nextTrackCommand.removeTarget(_nextTrack)
            commandCenter.previousTrackCommand.isEnabled = false
            commandCenter.previousTrackCommand.removeTarget(_prevTrack)

            DispatchQueue.main.async {
                UIApplication.shared.endReceivingRemoteControlEvents()
            }
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
        self?.restartPlayback()
    }

    @objc func handleMediaServicesWereLost(_: Notification) {
        self?.restartPlayback()
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
