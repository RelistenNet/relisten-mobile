//
//  RelistenGaplessAudioPlayer.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/12/23.
//

import Foundation

import AVFAudio

public protocol RelistenGaplessAudioPlayerDelegate {
    func errorStartingStream(_ player: RelistenGaplessAudioPlayer, error: NSError, forStreamable: RelistenGaplessStreamable)

    func playbackStateChanged(_ player: RelistenGaplessAudioPlayer, newPlaybackState playbackState: PlaybackState)
    func playbackProgressChanged(_ player: RelistenGaplessAudioPlayer, elapsed: TimeInterval?, duration: TimeInterval?)
    func downloadProgressChanged(_ player: RelistenGaplessAudioPlayer, forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64)
    func trackChanged(_ player: RelistenGaplessAudioPlayer, previousStreamable: RelistenGaplessStreamable?, currentStreamable: RelistenGaplessStreamable?)

    func audioSessionWasSetup(_ player: RelistenGaplessAudioPlayer)
}

public struct RelistenGaplessStreamable {
    let url: URL
    let identifier: String
}


public class RelistenGaplessAudioPlayer {
    // MARK: - Public API

    public var delegate: RelistenGaplessAudioPlayerDelegate?

    // Values from https://github.com/einsteinx2/iSubMusicStreamer/blob/master/Classes/Audio%20Engine/Bass.swift

    // TODO: decide best value for this
    // 250ms (also used for BASS_CONFIG_UPDATEPERIOD, so total latency is 500ms)
    static let outputBufferSize: DWORD = 250

    // TODO: 48Khz is the default hardware sample rate of the iPhone,
    //       but since most released music is 44.1KHz, need to confirm if it's better
    //       to let BASS to the upsampling, or let the DAC do it...
    static let outputSampleRate: DWORD = 44100

    private(set) static var bassOutputBufferLengthMillis: DWORD = 0

    public internal(set) var activeStream: RelistenGaplessAudioStream?
    public internal(set) var nextStream: RelistenGaplessAudioStream?

    public var currentDuration: TimeInterval? {
        guard isSetup, let activeStream else {
            return nil
        }

        let len = BASS_ChannelGetLength(activeStream.stream, DWORD(BASS_POS_BYTE))

        if len == DWORD(bitPattern: -1) {
            return nil
        }

        return BASS_ChannelBytes2Seconds(activeStream.stream, len + activeStream.channelOffset)
    }

    public var elapsed: TimeInterval? {
        guard isSetup, let activeStream else {
            return nil
        }

        let elapsedBytes = BASS_ChannelGetPosition(activeStream.stream, DWORD(BASS_POS_BYTE))

        if elapsedBytes == DWORD(bitPattern: -1) {
            return nil
        }

        return BASS_ChannelBytes2Seconds(activeStream.stream, elapsedBytes + activeStream.channelOffset)
    }
    
    public var activeTrackDownloadedBytes: UInt64? {
        guard isSetup, let activeStream = activeStream else {
            return nil
        }

        let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD))
        
        return downloadedBytes
    }
    
    public var activeTrackTotalBytes: UInt64? {
        guard isSetup, let activeStream = activeStream else {
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
            _currentState = newValue

            DispatchQueue.main.async { [self] in
                delegate?.playbackStateChanged(self, newPlaybackState: _currentState)
            }
        }
    }

    public func prepareAudioSession() {
        // needed to handle weird car bluetooth scenarios
        let shouldActivate = !(AVAudioSession.sharedInstance().secondaryAudioShouldBeSilencedHint)
        setupAudioSession(shouldActivate: shouldActivate)
    }

    public func play(_ streamable: RelistenGaplessStreamable) {
        play(streamable, startingAt: 0.0)
    }

    public func play(_ streamable: RelistenGaplessStreamable, startingAt: Double) {
        setupAudioSession(shouldActivate: true)

        if let activeStream, let nextStream, activeStream.streamable.identifier == nextStream.streamable.identifier {
            next()

            return
        }
        // else if let activeStream, activeStream.streamable.identifier == streamable.identifier {
        //     seekToPercent(startingAt)

        //     return
        // }

        bassQueue.async {
            self.playStreamableImmediately(streamable)
        }
    }

    public func setNextStream(_ streamable: RelistenGaplessStreamable?) {
        bassQueue.async { [self] in
            maybeSetupBASS()
            
            guard let streamable = streamable else {
                maybeTearDownNextStream()
                
                return
            }

            if nextStream?.streamable.identifier == streamable.identifier {
                return
            }

            // do the same thing for inactive--but only if the next track is actually different
            // and if something is currently playing
            maybeTearDownNextStream()
            
            nextStream = buildStream(streamable)

            if activeStream?.preloadFinished == true {
                startPreloadingNextStream()
            }
        }
    }
    
    
    func maybeTearDownActiveStream() {
        if let activeStream {
            tearDownStream(activeStream.stream)
            self.activeStream = nil
        }
    }
    
    func maybeTearDownNextStream() {
        if let nextStream {
            tearDownStream(nextStream.stream)
            self.nextStream = nil
        }
    }

    public func resume() {
        bassQueue.async {
            self.maybeSetupBASS()

            if BASS_Start() != 0 {
                self.currentState = .Playing
            }
        }
    }

    public func pause() {
        bassQueue.async {
            self.maybeSetupBASS()

            if BASS_Pause() != 0 {
                self.currentState = .Paused
            }
        }
    }

    public func stop() {
        bassQueue.async {
            self.maybeSetupBASS()

            if let mixerMainStream = self.mixerMainStream, BASS_ChannelStop(mixerMainStream) != 0 {
                self.delegate?.trackChanged(self, previousStreamable: self.activeStream?.streamable, currentStreamable: nil)
                self.currentState = .Stopped
                
                self.maybeTearDownActiveStream()
                self.maybeTearDownNextStream()
            }
        }
    }

    public func next() {
        bassQueue.async {
            self.maybeSetupBASS()

            if self.nextStream != nil, let activeStream = self.activeStream {
                self.mixInNextStream(completedStream: activeStream.stream)
            }
        }
    }

    public func seekTo(percent: Double) {
        if percent >= 1.0 {
            next()
            return
        }

        bassQueue.async {
            self.seekToPercent(percent)
        }
    }

    // MARK: - Private properties

    internal let bassQueue = DispatchQueue(label: "net.relisten.ios.bass-queue")
    internal var mixerMainStream: HSTREAM?
    internal var isSetup = false

    internal var audioSessionObserversSetUp = false
    internal var audioSessionAlreadySetUp = false

    internal var _currentState: PlaybackState = .Stopped
    internal var wasPlayingWhenInterrupted: Bool = false
    
    deinit {
        maybeTearDownBASS()
        tearDownAudioSession()
    }
}
