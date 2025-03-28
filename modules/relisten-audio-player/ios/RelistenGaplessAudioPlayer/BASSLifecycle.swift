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

        isSetup = true

        // BASS_SetConfigPtr(BASS_CONFIG_NET_PROXY, "192.168.1.196:8888");
        BASS_SetConfig(DWORD(BASS_CONFIG_NET_TIMEOUT), 30 * 1000)

        // Disable mixing. To be called before BASS_Init.
        BASS_SetConfig(DWORD(BASS_CONFIG_IOS_MIXAUDIO), 0)
        // Use 2 threads
        BASS_SetConfig(DWORD(BASS_CONFIG_UPDATETHREADS), 2)
        // Lower the update period to reduce latency
        BASS_SetConfig(DWORD(BASS_CONFIG_UPDATEPERIOD), RelistenGaplessAudioPlayer.outputBufferSize)
        // Set the buffer length to the minimum amount + outputBufferSize
        BASS_SetConfig(DWORD(BASS_CONFIG_BUFFER), BASS_GetConfig(DWORD(BASS_CONFIG_UPDATEPERIOD)) + RelistenGaplessAudioPlayer.outputBufferSize)
        // Set DSP effects to use floating point math to avoid clipping within the effects chain
        BASS_SetConfig(DWORD(BASS_CONFIG_FLOATDSP), 1)

        bass_assert(BASS_Init(-1, 44100, 0, nil, nil))

        mixerMainStream = BASS_Mixer_StreamCreate(44100, 2, DWORD(BASS_MIXER_END))

        BASS_ChannelSetSync(mixerMainStream!, DWORD(BASS_SYNC_END | BASS_SYNC_MIXTIME), 0, mixerEndSyncProc, Unmanaged.passUnretained(self).toOpaque())
    }

    func maybeTearDownBASS() {
        if !isSetup {
            return
        }

        isSetup = false

        if let activeStream {
            tearDownStream(activeStream)
            self.activeStream = nil
        }

        if let nextStream {
            tearDownStream(nextStream)
            self.nextStream = nil
        }

        BASS_Free()
    }

    func tearDownStream(_ relistenStream: RelistenGaplessAudioStream) {
        let stream = relistenStream.stream

        print("[bass][stream] tearing down stream \(relistenStream)")

        // stop channels to allow them to be freed
        BASS_ChannelStop(stream)

        // remove this stream from the mixer
        // not assert'd because sometimes it should fail (i.e. hasn't been added to the mixer yet)
        BASS_Mixer_ChannelRemove(stream)

        BASS_StreamFree(stream)

        relistenStream.streamCacher?.teardown()
    }

    // MARK: - BASS Event Listeners

    func mixInNextStream(completedStream _: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        guard let mixerMainStream else {
            return
        }

        let previousStream = activeStream

        if let nextStream {
            print("[bass][stream] mixing in next stream with norampin")
            bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream,
                                                    nextStream.stream,
                                                    DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))
            bass_assert(BASS_ChannelSetPosition(mixerMainStream, 0, DWORD(BASS_POS_BYTE)))

            // We cannot tear down yet because at mix time we've reached the end, the audio is still being used.
            // BASS_STREAM_AUTOFREE will automatically free the stream once it finishes playing.

            activeStream = nextStream
            self.nextStream = nil

            // this is needed because the stream download events don't fire for local music
            if nextStream.streamable.url.isFileURL {
                streamDownloadComplete(nextStream.stream)
            }
        } else {
            if BASS_ChannelStop(mixerMainStream) == 1 {
                BASS_Stop()
                currentState = .Stopped

                if let activeStream {
                    tearDownStream(activeStream)
                    self.activeStream = nil
                }
            }
        }

        if let previousStream {
            DispatchQueue.main.async {
                self.delegate?.trackChanged(self, previousStreamable: previousStream.streamable, currentStreamable: self.activeStream?.streamable)
            }
        }
    }

    func streamDownloadComplete(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        puts("[bass][stream] stream download complete: \(stream)")

        if let activeStream, stream == activeStream.stream {
            if !activeStream.preloadFinished {
                activeStream.preloadFinished = true

                startPreloadingNextStream()
            }
        } else if let nextStream, stream == nextStream.stream {
            nextStream.preloadStarted = true
            nextStream.preloadFinished = true

            // the inactive stream is also loaded--good, but we don't want to load anything else
            // we do want to start decoding the downloaded data though

            // The amount of data to render, in milliseconds... 0 = default (2 x update period)
            // bass_assert(BASS_ChannelUpdate(inactiveStream, 0));
        } else {
            NSLog("[bass][ERROR] whoa, unknown stream finished downloading: %u", stream)
        }
    }

    func streamStalled(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if stream == activeStream?.stream {
            puts("[bass][stream] stream stalled: \(stream)")
            currentState = .Stalled
        }
    }

    func streamResumedAfterStall(_ stream: HSTREAM) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        if stream == activeStream?.stream {
            puts("[bass][stream] stream resumed after stall: \(stream)")
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

                                                    puts("[base][stream] mixer end sync \(player) \(handle)")

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

                                                                    NSLog("[bass][stream] stream download completed: handle: %u. channel: %u", handle, channel)

                                                                    puts("\(player) \(handle)")

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

                                                        NSLog("[bass][stream] stream stall: handle: %u. channel: %u", handle, channel)

                                                        puts("\(player) \(handle)")

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
