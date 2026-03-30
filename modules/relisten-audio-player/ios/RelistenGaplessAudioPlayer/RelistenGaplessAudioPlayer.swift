//
//  RelistenGaplessAudioPlayer.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/12/23.
//

import Foundation

import AVFAudio
import MediaPlayer

public struct RelistenGaplessStreamable {
    let url: URL
    let identifier: String
    let title: String
    let artist: String
    let albumTitle: String
    let albumArt: String

    let downloadDestination: URL?
}

public class RelistenGaplessAudioPlayer {
    // MARK: - Public API

    var delegate: PlaybackBackendDelegate?

    // Values from https://github.com/einsteinx2/iSubMusicStreamer/blob/master/Classes/Audio%20Engine/Bass.swift

    // TODO: decide best value for this
    // 250ms (also used for BASS_CONFIG_UPDATEPERIOD, so total latency is 500ms)
    static let outputBufferSize: DWORD = 250

    // TODO: 48Khz is the default hardware sample rate of the iPhone,
    //       but since most released music is 44.1KHz, need to confirm if it's better
    //       to let BASS to the upsampling, or let the DAC do it...
    static let outputSampleRate: DWORD = 44100

    private(set) static var bassOutputBufferLengthMillis: DWORD = 0

    private var _activeStreamIntent: RelistenStreamIntent?
    public internal(set) var activeStreamIntent: RelistenStreamIntent? {
        get {
            dispatchPrecondition(condition: .onQueue(bassQueue))
            return _activeStreamIntent
        }
        set {
            dispatchPrecondition(condition: .onQueue(bassQueue))
            _activeStreamIntent = newValue
        }
    }
    private var _nextStreamIntent: RelistenStreamIntent?
    public internal(set) var nextStreamIntent: RelistenStreamIntent?  {
        get {
            dispatchPrecondition(condition: .onQueue(bassQueue))
            return _nextStreamIntent
        }
        set {
            dispatchPrecondition(condition: .onQueue(bassQueue))
            _nextStreamIntent = newValue
        }
    }
    
    public internal(set) var activeStream: RelistenGaplessAudioStream? {
        get { self.activeStreamIntent?.audioStream }
        set {
            if let activeStreamIntent {
                activeStreamIntent.audioStream = newValue
            }
        }
    }
    public internal(set) var nextStream: RelistenGaplessAudioStream? {
        get { self.nextStreamIntent?.audioStream }
        set {
            if let nextStreamIntent {
                nextStreamIntent.audioStream = newValue
            }
        }
    }

    let audioSessionController = AudioSessionController()
    let playbackPresentationController = PlaybackPresentationController()

    var commandCenter: MPRemoteCommandCenter {
        audioSessionController.commandCenter
    }

    public var currentDuration: TimeInterval? {
        guard isSetup, let activeStream else {
            return nil
        }

        guard let len = bassChannelLengthIncludingOffset(activeStream, context: "reading current duration") else {
            return nil
        }

        return BASS_ChannelBytes2Seconds(activeStream.stream, len)
    }

    public var elapsed: TimeInterval? {
        guard isSetup, let activeStream else {
            return nil
        }

        let elapsedBytes = BASS_ChannelGetPosition(activeStream.stream, DWORD(BASS_POS_BYTE))

        if elapsedBytes == QWORD(bitPattern: -1) {
            return nil
        }

        guard let elapsedIncludingOffset = bassChannelPositionIncludingOffset(elapsedBytes, activeStream: activeStream, context: "reading elapsed time") else {
            return nil
        }

        return BASS_ChannelBytes2Seconds(activeStream.stream, elapsedIncludingOffset)
    }

    public var activeTrackDownloadedBytes: UInt64? {
        guard isSetup, let activeStream else {
            return nil
        }

        let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD))

        return downloadedBytes
    }

    public var activeTrackTotalBytes: UInt64? {
        guard isSetup, let activeStream else {
            return nil
        }

        let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE))

        return totalFileBytes
    }

    public var volume: Float {
        get {
            guard isSetup else {
                return 0.0
            }

            return BASS_GetVolume()
        }
        set {
            guard isSetup else {
                return
            }

            BASS_SetVolume(newValue)
        }
    }

    public internal(set) var currentState: PlaybackState {
        get {
            guard let mixerMainStream else {
                return PlaybackState.Stopped
            }

            _currentState = PlaybackStateForBASSPlaybackState(BASS_ChannelIsActive(mixerMainStream))
            return _currentState
        }

        set {
            dispatchPrecondition(condition: .onQueue(bassQueue))

            _currentState = newValue

            playbackPresentationController.setPlaybackState(newValue)

            delegateQueue.async { [self] in
                delegate?.playbackStateChanged(newPlaybackState: _currentState)
            }
        }
    }

    public func prepareAudioSession() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        // needed to handle weird car bluetooth scenarios
        let shouldActivate = !(AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint)
        setupAudioSession(shouldActivate: shouldActivate)
    }

    public func play(_ streamable: RelistenGaplessStreamable) {
        play(streamable, startingAtMs: nil)
    }
    
    internal var numberOfStreamsFetching = 0

    public func play(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] play: streamable=\(streamable) startingAtMs=\(String(describing: startingAtMs))")
        setupAudioSession(shouldActivate: true)

        if let nextStreamIntent, nextStreamIntent.streamable.identifier == streamable.identifier {
            NSLog("[relisten-audio-player] play: calling next nextStream=\(nextStreamIntent.streamable.identifier)")
            next()

            return
        }
        else if let activeStreamIntent, let startingAtMs, activeStreamIntent.streamable.identifier == streamable.identifier {
            NSLog("[relisten-audio-player] play: calling seekToTime activeStream=\(activeStreamIntent.streamable.identifier)")
            seekToTime(startingAtMs)

            return
        }

        self.playStreamableImmediately(streamable, startingAtMs: startingAtMs)
    }
    
    public func setNextStream(_ streamable: RelistenGaplessStreamable?) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] setNextStream: streamable=\(String(describing: streamable))")

        cancelPendingBASSTeardown(reason: "updating next stream")
        maybeSetupBASS()

        guard let streamable = streamable else {
            maybeTearDownNextStream()

            return
        }

        if nextStreamIntent?.streamable.identifier == streamable.identifier {
            return
        }

        // do the same thing for inactive--but only if the next track is actually different
        // and if something is currently playing
        maybeTearDownNextStream()
        
        nextStreamIntent = RelistenStreamIntent(streamable: streamable)

        if activeStream?.preloadFinished == true {
            NSLog("[relisten-audio-player] activeStream.preloadFinished == true; starting to preload the next stream")
            startPreloadingNextStream()
        }
    }

    public func setRepeatMode(_ repeatMode: Int) {
        let repeatType: MPRepeatType

        switch repeatMode {
        case 2:
            repeatType = .one
        case 3:
            repeatType = .all
        default:
            repeatType = .off
        }

        DispatchQueue.main.async {
            self.commandCenter.changeRepeatModeCommand.currentRepeatType = repeatType
        }
    }

    public func setShuffleMode(_ shuffleMode: Int) {
        let shuffleType: MPShuffleType = shuffleMode == 2 ? .items : .off

        DispatchQueue.main.async {
            self.commandCenter.changeShuffleModeCommand.currentShuffleType = shuffleType
        }
    }

    func maybeTearDownActiveStream() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if let activeStreamIntent {
            NSLog("[relisten-audio-player] tearing down activeStream=\(activeStreamIntent.streamable.identifier)")
            tearDownStreamIntent(activeStreamIntent)
            self.activeStreamIntent = nil
        }
    }

    func maybeTearDownNextStream() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if let nextStreamIntent {
            NSLog("[relisten-audio-player] tearing down nextStream=\(nextStreamIntent.streamable.identifier)")
            tearDownStreamIntent(nextStreamIntent)
            self.nextStreamIntent = nil
        }
    }

    public func resume() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] resume")

        cancelPendingBASSTeardown(reason: "resuming playback")
        self.maybeSetupBASS()

        if BASS_Start() != 0 {
            self.currentState = .Playing
        }
    }

    public func pause() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] pause")

        self.maybeSetupBASS()

        if BASS_Pause() != 0 {
            self.currentState = .Paused
        }
    }

    public func stop() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] stop")
        self.maybeSetupBASS()

        if let mixerMainStream = self.mixerMainStream, BASS_ChannelStop(mixerMainStream) != 0 {
            let activeStreamIntent = activeStreamIntent
            
            delegateQueue.async {
                self.delegate?.trackChanged(previousStreamable: activeStreamIntent?.streamable, currentStreamable: nil)
            }
            
            self.currentState = .Stopped

            self.maybeTearDownActiveStream()
            self.maybeTearDownNextStream()
            self.requestFullTeardownWhenIdle(reason: "explicit stop")
        }
    }

    public func next() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] next")
        
        cancelPendingBASSTeardown(reason: "manual next")
        self.maybeSetupBASS()

        guard let mixerMainStream else {
            return
        }

        let previousStreamIntent = activeStreamIntent

        guard let queuedNextStreamIntent = nextStreamIntent else {
            if BASS_ChannelStop(mixerMainStream) == 1 {
                self.maybeTearDownActiveStream()
                self.currentState = .Stopped
                self.requestFullTeardownWhenIdle(reason: "manual next at end of queue")

                delegateQueue.async {
                    self.delegate?.trackChanged(previousStreamable: previousStreamIntent?.streamable,
                                                currentStreamable: nil)
                }
            }

            return
        }

        guard queuedNextStreamIntent.audioStream != nil else {
            NSLog("[relisten-audio-player][bass][stream] manual next has nextStreamIntent \(queuedNextStreamIntent.streamable.identifier) but no nextStream, calling playStreamableImmediately")
            self.nextStreamIntent = nil
            self.playStreamableImmediately(queuedNextStreamIntent.streamable, startingAtMs: nil)
            return
        }

        // Manual next behaves like a replace, not a natural gapless handoff.
        // Reset the mixer first so old attached channels are dropped before we reattach the promoted stream.
        resetMixerMainStreamForReplacement()

        if let previousStreamIntent {
            self.tearDownStreamIntent(previousStreamIntent)
            self.activeStreamIntent = nil
        }

        if !promoteNextStreamToActive(previousStreamIntent: previousStreamIntent, mode: .manualSkip) {
            NSLog("[relisten-audio-player][bass][stream] manual next failed to promote \(queuedNextStreamIntent.streamable.identifier), calling playStreamableImmediately")
            self.nextStreamIntent = nil
            self.playStreamableImmediately(queuedNextStreamIntent.streamable, startingAtMs: nil)
        }
    }

    public func seekTo(percent: Double) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        guard percent.isFinite else {
            NSLog("[relisten-audio-player] Ignoring non-finite seek percent=\(percent)")
            return
        }

        let normalizedPercent = min(max(percent, 0.0), 1.0)

        if normalizedPercent != percent {
            NSLog("[relisten-audio-player] Clamped seek percent from \(percent) to \(normalizedPercent)")
        }

        NSLog("[relisten-audio-player] seekTo percent=\(normalizedPercent)")

        if normalizedPercent >= 1.0 {
            delegateQueue.async {
                self.delegate?.remoteControl(method: "nextTrack")
            }
            
            return
        }

        self.seekToPercent(normalizedPercent)
    }

    public func _resume(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        delegateQueue.async {
            self.delegate?.remoteControl(method: "resume")
        }
        
        self.bassQueue.async {
            self.resume()
        }

        return MPRemoteCommandHandlerStatus.success
    }

    public func _pause(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        delegateQueue.async {
            self.delegate?.remoteControl(method: "pause")
        }
        
        self.bassQueue.async {
            self.pause()
        }

        return MPRemoteCommandHandlerStatus.success
    }

    public func _togglePlayPause(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        let shouldPause = self.currentState == .Playing

        delegateQueue.async {
            self.delegate?.remoteControl(method: shouldPause ? "pause" : "resume")
        }

        self.bassQueue.async {
            if shouldPause {
                self.pause()
            } else {
                self.resume()
            }
        }

        return MPRemoteCommandHandlerStatus.success
    }

    public func _nextTrack(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        delegateQueue.async {
            self.delegate?.remoteControl(method: "nextTrack")
        }
        // handled on the JS thread

        return MPRemoteCommandHandlerStatus.success
    }

    public func _prevTrack(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        delegateQueue.async {
            self.delegate?.remoteControl(method: "prevTrack")
        }
        // handled on the JS thread

        return MPRemoteCommandHandlerStatus.success
    }

    public func _seekTo(event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
        guard let event = event as? MPChangePlaybackPositionCommandEvent else {
            return .commandFailed
        }

        if event.positionTime >= 0 {
            self.bassQueue.async {
                self.seekToTime(Int64(event.positionTime * 1000))
            }
            return .success
        }

        return .commandFailed
    }

    // MARK: - Private properties

    internal let bassQueue = DispatchQueue(label: "net.relisten.ios.bass-queue", qos: .userInteractive)
    internal let networkQueue = DispatchQueue(label: "net.relisten.ios.bass-network-queue", qos: .userInitiated, attributes: .concurrent)
    internal let delegateQueue = DispatchQueue(label: "net.relisten.ios.delegate-queue", qos: .userInteractive)
    
    internal var mixerMainStream: HSTREAM?
    internal var isSetup = false

    internal var audioSessionObserversSetUp = false
    internal var audioSessionAlreadySetUp = false

    internal var _currentState: PlaybackState = .Stopped
    internal var wasPlayingWhenInterrupted: Bool = false
    
    internal var latestDebouncedStreamIntent: RelistenStreamIntent? = nil
    internal var pendingIdleBASSTeardown = false
    internal var playCommandTarget: Any?
    internal var pauseCommandTarget: Any?
    internal var togglePlayPauseCommandTarget: Any?
    internal var changePlaybackPositionCommandTarget: Any?
    internal var nextTrackCommandTarget: Any?
    internal var previousTrackCommandTarget: Any?

    deinit {
        bassQueue.sync {
            maybeTearDownBASS()
            tearDownAudioSession()
        }

        audioSessionController.teardown()
        playbackPresentationController.teardown()
    }
}
