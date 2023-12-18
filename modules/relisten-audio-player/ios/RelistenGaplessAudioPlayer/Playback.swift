//
//  PlaybackState.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

extension RelistenGaplessAudioPlayer {
    func playStreamableImmediately(_ streamable: RelistenGaplessStreamable) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        maybeSetupBASS()

        guard let mixerMainStream else {
            assertionFailure("mixerMainStream is nil after setting up BASS")
            return
        }

        // stop playback
        bass_assert(BASS_ChannelStop(mixerMainStream))

        if let activeStream {
            tearDownStream(activeStream.stream)
        }

        activeStream = buildStream(streamable)

        if let activeStream {
            bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream,
                                                    activeStream.stream,
                                                    DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))

            // Make sure BASS is started, just in case we had paused it earlier
            BASS_Start()
            print("[bass][stream] BASS_Start() called")

            // the TRUE for the second argument clears the buffer so there isn't old sound playing
            bass_assert(BASS_ChannelPlay(mixerMainStream, 1))

            DispatchQueue.main.async {
                self.delegate?.trackChanged(self, previousStreamable: nil, currentStreamable: self.activeStream?.streamable)
            }

            currentState = .Playing

            updateControlCenter(artwork: nil);
            fetchAlbumArt(href: activeStream.streamable.albumArt);
            
            // this is needed because the stream download events don't fire for local music
            if activeStream.streamable.url.isFileURL {
                // this will call nextTrackChanged and setupInactiveStreamWithNext
                streamDownloadComplete(activeStream.stream)
            }
        } else {
            assertionFailure("activeStream nil after buildingStream from \(streamable)")
        }

        startUpdates()
    }

    func seekToPercent(_ pct: Double) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        // NOTE: all these calculations use the stream request offset to translate the #s into one's valid
        // for the *entire* track. we must be careful to identify situations where we need to make a new request
        maybeSetupBASS()

        guard let activeStream else {
            // The user may have tried to seek before the stream has loaded.
            // TODO: Store the desired seek percent and apply it once the stream has loaded
            NSLog("[bass][stream] Stream hasn't loaded yet. Ignoring seek to %f.", pct)
            return
        }

        let len = BASS_ChannelGetLength(activeStream.stream, DWORD(BASS_POS_BYTE)) + activeStream.channelOffset
        let duration = BASS_ChannelBytes2Seconds(activeStream.stream, len)
        let seekTo = BASS_ChannelSeconds2Bytes(activeStream.stream, duration * Double(pct))
        let seekToDuration = BASS_ChannelBytes2Seconds(activeStream.stream, seekTo)

        NSLog("[bass][stream] Found length in bytes to be %llu bytes/%f. Seeking to: %llu bytes/%f", len, duration, seekTo, seekToDuration)

        let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD)) + UInt64(activeStream.fileOffset)
        let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE)) + UInt64(activeStream.fileOffset)
        let downloadedPct = 1.0 * Double(downloadedBytes) / Double(totalFileBytes)

        let seekingBeforeStartOfThisRequest = seekTo < activeStream.channelOffset
        let seekingBeyondDownloaded = Double(pct) > downloadedPct

        // seeking before the offset point --> we need to make a new request
        // seeking after the most recently downloaded data --> we need to make a new request
        if seekingBeforeStartOfThisRequest || seekingBeyondDownloaded {
            let fileOffset = DWORD(floor(pct * Double(totalFileBytes)))

            NSLog("[bass][stream] Seek %% (%f/%u) is greater than downloaded %% (%f/%llu) OR seek channel byte (%llu) < start channel offset (%llu). Opening new stream.", pct, fileOffset, downloadedPct, downloadedBytes, seekTo, activeStream.channelOffset)

            let oldActiveStream = activeStream

            let newActiveStream = buildStream(activeStream.streamable, fileOffset: fileOffset, channelOffset: seekTo)
            self.activeStream = newActiveStream

            if let newActiveStream, let mixerMainStream {
                bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream, newActiveStream.stream, DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))

                BASS_Start()
                // the TRUE for the second argument clears the buffer to prevent bits of the old playback
                bass_assert(BASS_ChannelPlay(mixerMainStream, 1))

                tearDownStream(oldActiveStream.stream)
            }
        } else {
            bass_assert(BASS_ChannelSetPosition(activeStream.stream, seekTo - activeStream.channelOffset, DWORD(BASS_POS_BYTE)))
        }
    }
}
