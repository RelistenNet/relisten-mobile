//
//  PlaybackState.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

// https://stackoverflow.com/a/48566887/240569
extension URL {
    var attributes: [FileAttributeKey : Any]? {
        do {
            return try FileManager.default.attributesOfItem(atPath: path)
        } catch let error as NSError {
            NSLog("[relisten-audio-player]FileAttribute error: \(error)")
        }
        return nil
    }

    var fileSize: UInt64 {
        return attributes?[.size] as? UInt64 ?? UInt64(0)
    }

}

extension RelistenGaplessAudioPlayer {
    func playStreamableImmediately(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?) {
        NSLog("[relisten-audio-player][bass][stream] playStreamableImmediately: streamable \(streamable.identifier) startingAtMs=\(String(describing: startingAtMs))")
        
        dispatchPrecondition(condition: .onQueue(bassQueue))

        maybeSetupBASS()

        guard let mixerMainStream else {
            assertionFailure("playStreamableImmediately: mixerMainStream is nil after setting up BASS")
            return
        }

        // stop playback
        bass_assert(BASS_ChannelStop(mixerMainStream))

        self.maybeTearDownActiveStream()
        self.maybeTearDownNextStream()

        let newIntent = RelistenStreamIntent(streamable: streamable)
        activeStreamIntent = newIntent
        activeStream = buildStream(newIntent)

        if let activeStream {
            if let startingAtMs, startingAtMs > 0 {
                // perform BASS level seek before mixing in the audio
                seekToTime(startingAtMs)
            }
            
            bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream,
                                                    activeStream.stream,
                                                    DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))

            // Make sure BASS is started, just in case we had paused it earlier
            BASS_Start()
            NSLog("[relisten-audio-player][bass][stream] playStreamableImmediately: BASS_Start() called")

            // the TRUE for the second argument clears the buffer so there isn't old sound playing
            bass_assert(BASS_ChannelPlay(mixerMainStream, 1))

            DispatchQueue.main.async {
                self.delegate?.trackChanged(self, previousStreamable: nil, currentStreamable: newIntent.streamable)
            }

            currentState = .Playing

            updateControlCenter()

            // this is needed because the stream download events don't fire for local music
            if newIntent.streamable.url.isFileURL {
                // this will call nextTrackChanged and setupInactiveStreamWithNext
                streamDownloadComplete(activeStream.stream)
                // also trigger downloadProgress update since it won't be triggered or accurate for a local file
                self.delegate?.downloadProgressChanged(self, forActiveTrack: true, downloadedBytes: newIntent.streamable.url.fileSize, totalBytes: newIntent.streamable.url.fileSize);
            }
            
            startUpdates()
        } else {
            NSLog("[relisten-audio-player][bass][stream] playStreamableImmediately: activeStream nil after buildingStream from \(streamable)")
        }
    }
    
    func seekToTime(_ timeMs: Int64) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        // NOTE: all these calculations use the stream request offset to translate the #s into one's valid
        // for the *entire* track. we must be careful to identify situations where we need to make a new request
        maybeSetupBASS()

        guard let activeStream else {
            // The user may have tried to seek before the stream has loaded.
            // TODO: Store the desired seek percent and apply it once the stream has loaded
            NSLog("[relisten-audio-player][bass][stream] Stream hasn't loaded yet. Ignoring seek to %f ms.", timeMs)
            return
        }

        let len = BASS_ChannelGetLength(activeStream.stream, DWORD(BASS_POS_BYTE)) + activeStream.channelOffset
        let duration = BASS_ChannelBytes2Seconds(activeStream.stream, len)
        let seekTo = BASS_ChannelSeconds2Bytes(activeStream.stream, Double(timeMs) / Double(1000))
        let seekToDuration = BASS_ChannelBytes2Seconds(activeStream.stream, seekTo)

        NSLog("[relisten-audio-player][bass][stream][seekToTimeMs=%llu] Found length in bytes to be %llu bytes/%f. Seeking to: %llu bytes/%f", timeMs, len, duration, seekTo, seekToDuration)

        seekToBytes(seekTo, pct: Double(seekToDuration) / Double(duration))
    }
    
    func seekToBytes(_ seekTo: UInt64, pct: Double) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        // NOTE: all these calculations use the stream request offset to translate the #s into one's valid
        // for the *entire* track. we must be careful to identify situations where we need to make a new request
        maybeSetupBASS()

        guard let activeStreamIntent, let activeStream else {
            // The user may have tried to seek before the stream has loaded.
            // TODO: Store the desired seek percent and apply it once the stream has loaded
            NSLog("[relisten-audio-player][bass][stream] Stream hasn't loaded yet. Ignoring seek to %f.", seekTo)
            return
        }
        
        let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD)) + UInt64(activeStream.fileOffset)
        let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE)) + UInt64(activeStream.fileOffset)
        let downloadedPct = 1.0 * Double(downloadedBytes) / Double(totalFileBytes)

        let seekingBeforeStartOfThisRequest = seekTo < activeStream.channelOffset
        let seekingBeyondDownloaded = pct > downloadedPct

        // seeking before the offset point --> we need to make a new request
        // seeking after the most recently downloaded data --> we need to make a new request
        if seekingBeforeStartOfThisRequest || seekingBeyondDownloaded {
            // the file offset is different than the seekToBytes
            let fileOffset = DWORD(floor(pct * Double(totalFileBytes)))

            NSLog("[relisten-audio-player][bass][stream] Seek %% (%f/%u) is greater than downloaded %% (%f/%llu) OR seek channel byte (%llu) < start channel offset (%llu). Opening new stream.", pct, fileOffset, downloadedPct, downloadedBytes, seekTo, activeStream.channelOffset)

            let oldActiveStreamIntent = activeStreamIntent
            let oldActiveStream = activeStreamIntent.audioStream

            //  tear down the stream cacher before building the new stream so there's no possible write lock conflict on the file
            oldActiveStreamIntent.audioStream?.streamCacher?.teardown()

            let newActiveStream = buildStream(activeStreamIntent, fileOffset: fileOffset, channelOffset: seekTo)
            self.activeStream = newActiveStream

            if let newActiveStream, let mixerMainStream {
                bass_assert(BASS_Mixer_StreamAddChannel(mixerMainStream, newActiveStream.stream, DWORD(BASS_STREAM_AUTOFREE | BASS_MIXER_NORAMPIN)))

                BASS_Start()
                // the TRUE for the second argument clears the buffer to prevent bits of the old playback
                bass_assert(BASS_ChannelPlay(mixerMainStream, 1))

                if let oldActiveStream {
                    tearDownStream(oldActiveStream)
                }
            }
        } else {
            bass_assert(BASS_ChannelSetPosition(activeStream.stream, seekTo - activeStream.channelOffset, DWORD(BASS_POS_BYTE)))
        }
    }

    func seekToPercent(_ pct: Double) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        // NOTE: all these calculations use the stream request offset to translate the #s into one's valid
        // for the *entire* track. we must be careful to identify situations where we need to make a new request
        maybeSetupBASS()

        guard let activeStream else {
            // The user may have tried to seek before the stream has loaded.
            // TODO: Store the desired seek percent and apply it once the stream has loaded
            NSLog("[relisten-audio-player][bass][stream] Stream hasn't loaded yet. Ignoring seek to %f.", pct)
            return
        }

        let len = BASS_ChannelGetLength(activeStream.stream, DWORD(BASS_POS_BYTE)) + activeStream.channelOffset
        let duration = BASS_ChannelBytes2Seconds(activeStream.stream, len)
        let seekTo = BASS_ChannelSeconds2Bytes(activeStream.stream, duration * Double(pct))
        let seekToDuration = BASS_ChannelBytes2Seconds(activeStream.stream, seekTo)

        NSLog("[relisten-audio-player][bass][stream][pct=%f] Found length in bytes to be %llu bytes/%f. Seeking to: %llu bytes/%f", pct, len, duration, seekTo, seekToDuration)

        seekToBytes(seekTo, pct: pct)
    }
}
