//
//  BASSLifecycle.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

extension RelistenGaplessAudioPlayer {
    // MARK: - BASS Lifecycle

    func maybeSetupBASS() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if isSetup {
            return
        }
        
        NSLog("[relisten-audio-player] maybeSetupBASS: setting up")

        isSetup = true

        // BASS_SetConfigPtr(BASS_CONFIG_NET_PROXY, "192.168.1.196:8888");
        BASS_SetConfig(DWORD(BASS_CONFIG_NET_TIMEOUT), 30 * 1000)

        // Disable mixing. To be called before BASS_Init.
        BASS_SetConfig(DWORD(BASS_CONFIG_IOS_MIXAUDIO), 0)
        // Use 2 threads
        BASS_SetConfig(DWORD(BASS_CONFIG_UPDATETHREADS), 2)
        // Lower the update period to reduce latency
//        BASS_SetConfig(DWORD(BASS_CONFIG_UPDATEPERIOD), RelistenGaplessAudioPlayer.outputBufferSize)
        // Set the buffer length to the minimum amount + outputBufferSize
//        BASS_SetConfig(DWORD(BASS_CONFIG_BUFFER), BASS_GetConfig(DWORD(BASS_CONFIG_UPDATEPERIOD)) + RelistenGaplessAudioPlayer.outputBufferSize)
        // Set DSP effects to use floating point math to avoid clipping within the effects chain
        BASS_SetConfig(DWORD(BASS_CONFIG_FLOATDSP), 1)
        
        BASS_SetConfigPtr(DWORD(BASS_CONFIG_NET_AGENT), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")

        bass_assert(BASS_Init(-1, 44100, 0, nil, nil))

        mixerMainStream = BASS_Mixer_StreamCreate(44100, 2, DWORD(BASS_MIXER_END))

        BASS_ChannelSetSync(mixerMainStream!, DWORD(BASS_SYNC_END | BASS_SYNC_MIXTIME), 0, mixerEndSyncProc, Unmanaged.passUnretained(self).toOpaque())
    }

    func maybeTearDownBASS() {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] maybeTearDownBASS")

        if !isSetup {
            NSLog("[relisten-audio-player] maybeTearDownBASS: is not set up")
            return
        }

        isSetup = false

        if let activeStreamIntent {
            tearDownStreamIntent(activeStreamIntent)
            self.activeStreamIntent = nil
        }

        if let nextStreamIntent {
            tearDownStreamIntent(nextStreamIntent)
            self.nextStreamIntent = nil
        }
        
        BASS_Free()
        self.mixerMainStream = nil
    }

    func tearDownStreamIntent(_ streamIntent: RelistenStreamIntent) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        guard let relistenStream = streamIntent.audioStream else {
            return
        }
        
        NSLog("[relisten-audio-player][bass][stream] tearing down stream identifier=\(streamIntent.streamable.identifier) handle=\(relistenStream.stream)")
        
        tearDownStream(relistenStream)
        streamIntent.audioStream = nil
    }
    
    func tearDownStream(_ relistenStream: RelistenGaplessAudioStream) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        let stream = relistenStream.stream

        NSLog("[relisten-audio-player][bass][stream] tearing down stream handle=\(relistenStream.stream)")

        // stop channels to allow them to be freed
        let channelStopError = BASS_ChannelStop(stream)
        var errorCode: Int32? = nil

        if channelStopError == 0 {
            errorCode = BASS_ErrorGetCode()
            NSLog("[relisten-audio-player][bass][stream] error calling BASS_ChannelStop(stream): \(String(describing: errorCode))")
        }

        if errorCode == nil || errorCode != BASS_ERROR_HANDLE {
            // remove this stream from the mixer
            // not assert'd because sometimes it should fail (i.e. hasn't been added to the mixer yet)
            let mixerError = BASS_Mixer_ChannelRemove(stream)
            
            if mixerError == 0 {
                errorCode = BASS_ErrorGetCode()
                NSLog("[relisten-audio-player][bass][stream] error calling BASS_Mixer_ChannelRemove(stream): \(String(describing: errorCode))")
            }
        } else {
            NSLog("[relisten-audio-player][bass][stream] skipping BASS_Mixer_ChannelRemove(stream), got BASS_ERROR_HANDLE from BASS_ChannelStop(stream)")
        }

        // BASS_StreamFree will *crash* if the handle is invalid
        if errorCode == nil || errorCode != BASS_ERROR_HANDLE {
            if BASS_StreamFree(stream) == 0 {
                NSLog("[relisten-audio-player][bass][stream] error calling BASS_StreamFree(stream): \(BASS_ErrorGetCode())")
            }
        } else {
            NSLog("[relisten-audio-player][bass][stream] skipping BASS_StreamFree(stream), got BASS_ERROR_HANDLE from previous step")
        }
        
        // Do NOT call StreamCacherRegistry.sharedInstance.discard(streamCacher) here:
        // It could remove the last strong reference, causing streamDownloadProc to segfault (exc_bad_access)

        relistenStream.streamCacher?.teardown()
    }

    // MARK: - BASS Event Listeners

    func mixInNextStream(completedStream: HSTREAM?) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        NSLog("[relisten-audio-player] mixInNextStream completedStream=\(String(describing: completedStream))")

        guard let mixerMainStream else {
            return
        }

        let previousStreamIntent = activeStreamIntent

        if let nextStreamIntent, let nextStream {
            NSLog("[relisten-audio-player][bass][stream] mixing in next stream with norampin")
            bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream,
                                                    nextStream.stream,
                                                    DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))
            bass_assert(BASS_ChannelSetPosition(mixerMainStream, 0, DWORD(BASS_POS_BYTE)))

            // Make sure BASS is started, just in case we had paused it earlier
            BASS_Start()

            // We cannot tear down yet because at mix time we've reached the end, the audio is still being used.
            // BASS_STREAM_AUTOFREE will automatically free the stream once it finishes playing.

            activeStreamIntent = nextStreamIntent
            self.nextStreamIntent = nil

            // this is needed because the stream download events don't fire for local music
            if nextStreamIntent.streamable.url.isFileURL {
                streamDownloadComplete(nextStream.stream)
            }
            
            delegateQueue.async {
                self.delegate?.trackChanged(self, previousStreamable: previousStreamIntent?.streamable, currentStreamable: nextStreamIntent.streamable)
            }
        } else if let nextStreamIntent {
            NSLog("[relisten-audio-player][bass][stream] have nextStreamIntent \(nextStreamIntent.streamable.identifier) but no nextStream, calling playStreamableImmediately")
            // we have a next stream intent but never actually built the stream
            self.nextStreamIntent = nil
            self.playStreamableImmediately(nextStreamIntent.streamable, startingAtMs: nil)
        } else {
            if BASS_ChannelStop(mixerMainStream) == 1 {
                BASS_Stop()
                currentState = .Stopped

                if let activeStreamIntent {
                    tearDownStreamIntent(activeStreamIntent)
                    self.activeStreamIntent = nil
                }
            }
            
            delegateQueue.async {
                self.delegate?.trackChanged(self, previousStreamable: previousStreamIntent?.streamable, currentStreamable: nil)
            }
        }
    }

    func streamDownloadComplete(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if let activeStreamIntent, let activeStream, stream == activeStream.stream {
            NSLog("[relisten-audio-player][bass][stream] stream download complete: \(activeStreamIntent.streamable.identifier)")

            if !activeStream.preloadFinished {
                activeStream.preloadFinished = true

                self.bassQueue.async {
                    self.startPreloadingNextStream()
                }
            }
        } else if let nextStreamIntent, let nextStream, stream == nextStream.stream {
            NSLog("[relisten-audio-player][bass][stream] stream download complete: \(nextStreamIntent.streamable.identifier)")

            nextStream.preloadStarted = true
            nextStream.preloadFinished = true

            // the inactive stream is also loaded--good, but we don't want to load anything else
            // we do want to start decoding the downloaded data though

            // The amount of data to render, in milliseconds... 0 = default (2 x update period)
            // bass_assert(BASS_ChannelUpdate(inactiveStream, 0));
        } else {
            NSLog("[relisten-audio-player][bass][ERROR] whoa, unknown stream finished downloading: %u", stream)
        }
    }

    func streamStalled(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if let activeStreamIntent, let activeStream, stream == activeStream.stream {
            NSLog("[relisten-audio-player][bass][stream] stream stalled: \(activeStreamIntent.streamable.identifier)")
            currentState = .Stalled
        }
    }

    func streamResumedAfterStall(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if let activeStreamIntent, let activeStream, stream == activeStream.stream {
            NSLog("[relisten-audio-player][bass][stream] stream resumed after stall: \(activeStreamIntent.streamable.identifier)")
            currentState = .Playing
        }
    }
}

internal var mixerEndSyncProc: @convention(c) (_ handle: HSYNC,
                                               _ channel: DWORD,
                                               _ data: DWORD,
                                               _ user: UnsafeMutableRawPointer?) -> Void = {
                                                handle, channel, _, user in
                                                if let selfPtr = user {
                                                    let player: RelistenGaplessAudioPlayer = Unmanaged.fromOpaque(selfPtr).takeUnretainedValue()

                                                    NSLog("[relisten-audio-player][base][stream] mixer end sync \(player) \(handle)")

                                                    player.bassQueue.async {
                                                        player.mixInNextStream(completedStream: channel)
                                                    }
                                                }
                                               }

internal var streamDownloadCompleteSyncProc: @convention(c) (_ handle: HSYNC,
                                                             _ channel: DWORD,
                                                             _ data: DWORD,
                                                             _ user: UnsafeMutableRawPointer?) -> Void = {
                                                                handle, channel, _, user in
                                                                if let selfPtr = user {
                                                                    let player: RelistenGaplessAudioPlayer = Unmanaged.fromOpaque(selfPtr).takeUnretainedValue()

                                                                    NSLog("[relisten-audio-player][bass][stream] stream download completed: handle: %u. channel: %u", handle, channel)

                                                                    NSLog("[relisten-audio-player] \(player) \(handle)")

                                                                    player.bassQueue.async {
                                                                        // channel is the HSTREAM we created before
                                                                        player.streamDownloadComplete(channel)
                                                                    }
                                                                }
                                                             }

internal var streamStallSyncProc: @convention(c) (_ handle: HSYNC,
                                                  _ channel: DWORD,
                                                  _ data: DWORD,
                                                  _ user: UnsafeMutableRawPointer?) -> Void = {
                                                    handle, channel, data, user in
                                                    if let selfPtr = user {
                                                        let player: RelistenGaplessAudioPlayer = Unmanaged.fromOpaque(selfPtr).takeUnretainedValue()

                                                        NSLog("[relisten-audio-player][bass][stream] stream stall: handle: %u. channel: %u", handle, channel)

                                                        NSLog("[relisten-audio-player]\(player) \(handle)")

                                                        player.bassQueue.async {
                                                            // channel is the HSTREAM we created before
                                                            if data == 0 /* stalled */ {
                                                                player.streamStalled(channel)
                                                            } else if data == 1 /* resumed */ {
                                                                player.streamResumedAfterStall(channel)
                                                            }
                                                        }
                                                    }
                                                  }

func PlaybackStateForBASSPlaybackState(_ state: DWORD) -> PlaybackState {
    if state == BASS_ACTIVE_STOPPED {
        return .Stopped
    } else if state == BASS_ACTIVE_PLAYING {
        return .Playing
    } else if state == BASS_ACTIVE_PAUSED || state == BASS_ACTIVE_PAUSED_DEVICE {
        return .Paused
    } else if state == BASS_ACTIVE_STALLED || state == BASS_ACTIVE_WAITING || state == BASS_ACTIVE_QUEUED {
        return .Stalled
    }

    assertionFailure("Unknown BASS playback state \(state)")
    return .Stopped
}

func ErrorForErrorCode(_ erro: Int32) -> NSError {
    var str = "Unknown error"

    if erro == BASS_ERROR_INIT {
        str = "BASS_ERROR_INIT: BASS_Init has not been successfully called."
    } else if erro == BASS_ERROR_NOTAVAIL {
        str = "BASS_ERROR_NOTAVAIL: Only decoding channels (BASS_STREAM_DECODE) are allowed when using the \"no sound\" device. The BASS_STREAM_AUTOFREE flag is also unavailable to decoding channels."
    } else if erro == BASS_ERROR_NONET {
        str = "BASS_ERROR_NONET: No internet connection could be opened. Can be caused by a bad proxy setting."
    } else if erro == BASS_ERROR_ILLPARAM {
        str = "BASS_ERROR_ILLPARAM: url is not a valid URL."
    } else if erro == BASS_ERROR_SSL {
        str = "BASS_ERROR_SSL: SSL/HTTPS support is not available."
    } else if erro == BASS_ERROR_TIMEOUT {
        str = "BASS_ERROR_TIMEOUT: The server did not respond to the request within the timeout period, as set with the BASS_CONFIG_NET_TIMEOUT config option."
    } else if erro == BASS_ERROR_FILEOPEN {
        str = "BASS_ERROR_FILEOPEN: The file could not be opened."
    } else if erro == BASS_ERROR_FILEFORM {
        str = "BASS_ERROR_FILEFORM: The file's format is not recognised/supported."
    } else if erro == BASS_ERROR_CODEC {
        str = "BASS_ERROR_CODEC: The file uses a codec that is not available/supported. This can apply to WAV and AIFF files, and also MP3 files when using the \"MP3-free\" BASS version."
    } else if erro == BASS_ERROR_SPEAKER {
        str = "BASS_ERROR_SPEAKER: The sample format is not supported by the device/drivers. If the stream is more than stereo or the BASS_SAMPLE_FLOAT flag is used, it could be that they are not supported."
    } else if erro == BASS_ERROR_MEM {
        str = "BASS_ERROR_MEM: There is insufficient memory."
    } else if erro == BASS_ERROR_NO3D {
        str = "BASS_ERROR_NO3D: Could not initialize 3D support."
    } else if erro == BASS_ERROR_UNKNOWN {
        str = "BASS_ERROR_UNKNOWN: Some other mystery problem! Usually this is when the Internet is available but the server/port at the specific URL isn't."
    }

    return NSError(domain: "net.relisten.ios.relisten-audio-player", code: Int(erro), userInfo: [NSLocalizedDescriptionKey: str])
}
