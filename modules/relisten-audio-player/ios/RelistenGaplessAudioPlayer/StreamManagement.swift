//
//  StreamManagement.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

extension RelistenGaplessAudioPlayer {
    func buildStream(_ streamable: RelistenGaplessStreamable, fileOffset: DWORD = 0, channelOffset: QWORD = 0) -> RelistenGaplessAudioStream? {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        maybeSetupBASS()

        var newStream: HSTREAM = 0
        var streamCacher: RelistenStreamCacher?

        if streamable.url.isFileURL {
            newStream = BASS_StreamCreateFile(0,
                                              streamable.url.path.cString(using: .utf8),
                                              UInt64(fileOffset),
                                              0,
                                              DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_ASYNCFILE | BASS_STREAM_PRESCAN))
        } else {
            streamCacher = RelistenStreamCacher(self, streamable: streamable)

            if fileOffset == 0 {
                newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                 fileOffset,
                                                 DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                 streamDownloadProc,
                                                 Unmanaged.passUnretained(streamCacher!).toOpaque())
            } else {
                newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                 fileOffset,
                                                 DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                 nil,
                                                 nil)

            }
        }

        // oops
        if newStream == 0 {
            let err = ErrorForErrorCode(BASS_ErrorGetCode())

            NSLog("[bass][stream] error creating new stream: %d %@", err.code, err.localizedDescription)

            DispatchQueue.main.async {
                self.delegate?.errorStartingStream(self, error: err, forStreamable: streamable)
            }

            return nil
        }

        bass_assert(BASS_ChannelSetSync(newStream,
                                        DWORD(BASS_SYNC_MIXTIME | BASS_SYNC_DOWNLOAD),
                                        0,
                                        streamDownloadCompleteSyncProc,
                                        Unmanaged.passUnretained(self).toOpaque()))

        bass_assert(BASS_ChannelSetSync(newStream,
                                        DWORD(BASS_SYNC_MIXTIME | BASS_SYNC_STALL),
                                        0,
                                        streamStallSyncProc,
                                        Unmanaged.passUnretained(self).toOpaque()))

        NSLog("[bass][stream] created new stream: %u. identifier=%@", newStream, streamable.identifier)

        return RelistenGaplessAudioStream(
            streamable: streamable,
            streamCacher: streamCacher,
            stream: newStream,
            fileOffset: fileOffset,
            channelOffset: channelOffset
        )
    }

    func startPreloadingNextStream() {
        // don't start loading anything until the active stream has finished
        guard let nextStream, activeStream?.preloadFinished == true else {
            return
        }

        NSLog("[bass][preloadNextTrack] Preloading next track")

        BASS_ChannelUpdate(nextStream.stream, 0)
        nextStream.preloadStarted = true
    }
}

internal var streamDownloadProc: @convention(c) (_ buffer: UnsafeRawPointer?,
                                                 _ length: DWORD,
                                                 _ user: UnsafeMutableRawPointer?) -> Void = {
                                                    buffer, length, user in
                                                    if let streamCacherPtr = user {
                                                        let streamCacher: RelistenStreamCacher = Unmanaged.fromOpaque(streamCacherPtr).takeUnretainedValue()

                                                        if let safeBuffer = buffer, length > 0 {
                                                            let data = Data(bytes: safeBuffer, count: Int(length))
                                                            streamCacher.writeData(data)
                                                        } else {
                                                            streamCacher.finishWritingData()
                                                        }
                                                    }
                                                 }
